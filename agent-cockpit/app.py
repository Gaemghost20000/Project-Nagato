"""
Agent Cockpit Backend
Flask + WebSocket dashboard for monitoring Hermes (local) and Nagato (VM) agents.
"""

import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko
from flask import Flask, jsonify, send_from_directory, request
from flask_socketio import SocketIO, emit

app = Flask(__name__, static_folder="static")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "agent-cockpit-secret")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519_gaem")
NAGATO_HOST = "100.72.58.50"
NAGATO_USER = "hermes"
NAGATO_SSH_PORT = 22
HERMES_HOST = "100.101.46.81"
HERMES_USER = "u0_a474"
HERMES_SSH_PORT = 8022
SHARED_PROJECTS_REMOTE = "/home/hermes/shared-projects/"
SHARED_PROJECTS_LOCAL = os.path.expanduser("~/shared-projects/")

# Track session metadata per agent
SESSION_START = {
    "hermes": datetime.now(timezone.utc),
    "nagato": datetime.now(timezone.utc),
}

ACTIVE_AGENT = {"name": "hermes"}  # mutable ref so callbacks can update

# ---------------------------------------------------------------------------
# SSH helpers
# ---------------------------------------------------------------------------

def _ssh_connect(host: str, user: str, port: int = 22, timeout: int = 10) -> paramiko.SSHClient:
    """Return a connected paramiko SSHClient or raise."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key_path = SSH_KEY_PATH
    if os.path.isfile(key_path):
        pkey = paramiko.Ed25519Key.from_private_key_file(key_path)
        client.connect(host, port=port, username=user, pkey=pkey, timeout=timeout)
    else:
        # Fall back to agent / default keys
        client.connect(host, port=port, username=user, timeout=timeout)
    return client


def ssh_exec(host: str, user: str, cmd: str, timeout: int = 15, port: int = 22) -> str:
    """Run a command over SSH and return combined stdout+stderr."""
    try:
        client = _ssh_connect(host, user, port=port)
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        output = stdout.read().decode(errors="replace")
        err = stderr.read().decode(errors="replace")
        client.close()
        return (output + err).strip()
    except Exception as e:
        return f"[SSH error] {e}"


def nagato_cmd(cmd: str, timeout: int = 15) -> str:
    return ssh_exec(NAGATO_HOST, NAGATO_USER, cmd, timeout)


# ---------------------------------------------------------------------------
# Agent terminal helpers
# ---------------------------------------------------------------------------

def get_nagato_terminal(lines: int = 50) -> str:
    """Capture tmux pane for Nagato via SSH (container can't access tmux socket directly)."""
    raw = ssh_exec("127.0.0.1", NAGATO_USER, f"tmux capture-pane -t nagato-agent -p -S -{lines}", timeout=10)
    return raw


def get_hermes_terminal(lines: int = 50) -> str:
    """Capture tmux pane from Hermes via SSH to Termux device."""
    raw = ssh_exec(HERMES_HOST, HERMES_USER, "export PATH=$PATH:/data/data/com.termux/files/usr/bin; tmux capture-pane -t 0 -p -S -%d" % lines, port=HERMES_SSH_PORT, timeout=10)
    if raw.startswith("[SSH error]"):
        raw = ssh_exec(HERMES_HOST, HERMES_USER, "export PATH=$PATH:/data/data/com.termux/files/usr/bin; tail -30 ~/.hermes/logs/gateway.log 2>/dev/null || tmux list-sessions 2>/dev/null || echo [hermes running]", port=HERMES_SSH_PORT, timeout=10)
    return raw


def send_command_to_nagato(command: str) -> str:
    """Send a keystroke/command to Nagato's tmux session via SSH."""
    escaped = command.replace("'", "'\\''")
    return ssh_exec("127.0.0.1", NAGATO_USER, f"tmux send-keys -t nagato-agent '{escaped}' Enter", timeout=10)


# ---------------------------------------------------------------------------
# System metrics helpers
# ---------------------------------------------------------------------------

def _parse_metrics(raw: str) -> dict:
    """Parse the one-liner stats string into a dict."""
    info: dict = {}
    for part in raw.split("|||"):
        if "=" in part:
            k, v = part.split("=", 1)
            info[k.strip()] = v.strip()
    return info


def get_nagato_metrics() -> dict:
    """Get local system metrics for Nagato (running on this host)."""
    try:
        cpu = subprocess.run(
            ["sh", "-c", "top -bn1 2>/dev/null | grep 'Cpu' | awk '{print $2}' || echo N/A"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()

        mem = subprocess.run(
            ["free", "-m"], capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        mem_used = mem_total = "N/A"
        for line in mem.splitlines():
            if line.startswith("Mem:"):
                parts = line.split()
                mem_used, mem_total = parts[2], parts[1]

        disk = subprocess.run(
            ["df", "-h", "/"], capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        disk_used = disk_total = "N/A"
        for line in disk.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 2:
                disk_used, disk_total = parts[2], parts[1]

        return {
            "cpu": cpu or "N/A",
            "mem_used": mem_used,
            "mem_total": mem_total,
            "disk_used": disk_used,
            "disk_total": disk_total,
            "status": "online",
            "session_duration": str(datetime.now(timezone.utc) - SESSION_START["nagato"]),
            "model": os.environ.get("NAGATO_MODEL", "qwen/qwen3-32b"),
            "host": "localhost",
        }
    except Exception as e:
        return {"status": "offline", "error": str(e)}


def get_hermes_metrics() -> dict:
    """Get system metrics from Hermes via SSH."""
    cmd = "echo cpu=$(top -bn1 2>/dev/null | head -1) mem_used=$(cat /proc/meminfo | grep MemAvailable | awk '{print int(($2)/1024)}') mem_total=$(cat /proc/meminfo | grep MemTotal | awk '{print int(($2)/1024)}') disk_used=$(df -h /data 2>/dev/null | tail -1 | awk '{print $3}') disk_total=$(df -h /data 2>/dev/null | tail -1 | awk '{print $2}') uptime=$(uptime)"
    raw = ssh_exec(HERMES_HOST, HERMES_USER, cmd, port=HERMES_SSH_PORT, timeout=10)
    metrics = _parse_metrics(raw) if not raw.startswith("[SSH error]") else {}
    metrics["status"] = "online" if not raw.startswith("[SSH error]") else "offline"
    metrics["session_duration"] = str(datetime.now(timezone.utc) - SESSION_START["hermes"])
    metrics["model"] = os.environ.get("HERMES_MODEL", "xiaomi/mimo-v2-pro")
    metrics["host"] = HERMES_HOST
    return metrics


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/agents", methods=["GET"])
def list_agents():
    agents = []
    # Check Nagato via SSH (tmux session on host)
    nagato_online = True
    try:
        pong = ssh_exec("127.0.0.1", NAGATO_USER, "tmux has-session -t nagato-agent", timeout=5)
        nagato_online = not pong.startswith("[SSH error]")
    except Exception:
        nagato_online = False

    agents.append({
        "name": "nagato",
        "display_name": "Nagato (VM)",
        "host": NAGATO_HOST,
        "status": "online" if nagato_online else "offline",
        "type": "remote",
    })
    hermes_online = False
    try:
        pong = ssh_exec(HERMES_HOST, HERMES_USER, "export PATH=$PATH:/data/data/com.termux/files/usr/bin; echo ok", port=HERMES_SSH_PORT, timeout=5)
        hermes_online = not pong.startswith("[SSH error]")
    except Exception:
        hermes_online = False

    agents.append({
        "name": "hermes",
        "display_name": "Hermes (Termux)",
        "host": HERMES_HOST,
        "status": "online" if hermes_online else "offline",
        "type": "local",
    })

    return jsonify({"agents": agents, "active_agent": ACTIVE_AGENT["name"]})


@app.route("/api/agents/<name>/terminal", methods=["GET"])
def agent_terminal(name: str):
    lines = request.args.get("lines", 50, type=int)
    if name == "nagato":
        output = get_nagato_terminal(lines)
    elif name == "hermes":
        output = get_hermes_terminal(lines)
    else:
        return jsonify({"error": f"Unknown agent '{name}'"}), 404
    return jsonify({"agent": name, "output": output, "lines": lines})


@app.route("/api/agents/<name>/metrics", methods=["GET"])
def agent_metrics(name: str):
    if name == "nagato":
        metrics = get_nagato_metrics()
    elif name == "hermes":
        metrics = get_hermes_metrics()
    else:
        return jsonify({"error": f"Unknown agent '{name}'"}), 404
    return jsonify({"agent": name, "metrics": metrics})


@app.route("/api/agents/<name>/command", methods=["POST"])
def agent_command(name: str):
    """Send a command to an agent's tmux session."""
    data = request.get_json(force=True)
    cmd = data.get("command", "")
    if not cmd:
        return jsonify({"error": "No command provided"}), 400

    if name == "nagato":
        result = send_command_to_nagato(cmd)
    elif name == "hermes":
        escaped = cmd.replace("'", "'\\''")
        result = ssh_exec(NAGATO_HOST, NAGATO_USER, f"tmux send-keys -t main '{escaped}' Enter", timeout=10)
        if result.startswith("[SSH error]"):
            result = f"SSH send failed: {result}"
        else:
            result = "Command sent"
    else:
        return jsonify({"error": f"Unknown agent '{name}'"}), 404

    return jsonify({"agent": name, "command": cmd, "result": result})


@app.route("/api/agents/<name>/active", methods=["POST"])
def set_active_agent(name: str):
    if name not in ("hermes", "nagato"):
        return jsonify({"error": f"Unknown agent '{name}'"}), 404
    ACTIVE_AGENT["name"] = name
    return jsonify({"active_agent": name})


@app.route("/api/projects", methods=["GET"])
def list_projects():
    """List shared projects directory (remote on Nagato, local fallback)."""
    projects = []

    # Try remote first
    try:
        raw = nagato_cmd(f"ls -la --time-style=long-iso {SHARED_PROJECTS_REMOTE} 2>/dev/null", timeout=10)
        if raw and not raw.startswith("[SSH error]") and not raw.startswith("ls:"):
            for line in raw.splitlines()[1:]:  # skip 'total ...'
                parts = line.split(None, 7)
                if len(parts) >= 8:
                    projects.append({
                        "name": parts[7],
                        "size": parts[4],
                        "modified": f"{parts[5]} {parts[6]}",
                        "permissions": parts[0],
                        "location": "nagato",
                    })
    except Exception:
        pass

    # Also list local
    local_dir = SHARED_PROJECTS_LOCAL
    if os.path.isdir(local_dir):
        for entry in sorted(os.listdir(local_dir)):
            full = os.path.join(local_dir, entry)
            st = os.stat(full)
            projects.append({
                "name": entry,
                "size": str(st.st_size),
                "modified": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                "permissions": oct(st.st_mode)[-3:],
                "location": "local",
            })

    return jsonify({"projects": projects, "remote_path": SHARED_PROJECTS_REMOTE, "local_path": local_dir})



WATCHDOG_STATE = {}

@app.route("/api/agent/heartbeat", methods=["POST"])
def agent_heartbeat():
    data = request.get_json(force=True)
    agent_name = data.get("agent", "unknown")
    WATCHDOG_STATE[agent_name] = {
        "timestamp": data.get("timestamp"),
        "status": data.get("status", "online"),
        "metrics": data.get("metrics", {}),
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }
    return jsonify({"received": True, "agent": agent_name})

@app.route("/api/agent/watchdog", methods=["POST"])
def watchdog_heartbeat():
    data = request.get_json(force=True)
    WATCHDOG_STATE["nagato-watchdog"] = data
    return jsonify({"received": True})

@app.route("/api/watchdog/status", methods=["GET"])
def watchdog_status():
    return jsonify(WATCHDOG_STATE)


# ---------------------------------------------------------------------------
# WebSocket events
# ---------------------------------------------------------------------------

@socketio.on("connect")
def ws_connect():
    emit("connected", {"status": "ok", "active_agent": ACTIVE_AGENT["name"]})


@socketio.on("subscribe_terminal")
def ws_subscribe_terminal(data):
    """Client requests live terminal stream for a given agent."""
    agent = data.get("agent", ACTIVE_AGENT["name"])
    emit("terminal_update", {
        "agent": agent,
        "output": get_nagato_terminal() if agent == "nagato" else get_hermes_terminal(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@socketio.on("set_active")
def ws_set_active(data):
    agent = data.get("agent")
    if agent in ("hermes", "nagato"):
        ACTIVE_AGENT["name"] = agent
        emit("active_changed", {"active_agent": agent}, broadcast=True)


# ---------------------------------------------------------------------------
# Background terminal streaming thread
# ---------------------------------------------------------------------------

try:
    from eventlet import sleep as eventlet_sleep
except ImportError:
    from time import sleep as eventlet_sleep


def _terminal_stream_loop():
    """Push terminal updates to all connected clients every 2 seconds."""
    while True:
        eventlet_sleep(2)
        try:
            for agent in ("hermes", "nagato"):
                if agent == "nagato":
                    output = get_nagato_terminal(30)
                else:
                    output = get_hermes_terminal(30)
                socketio.emit("terminal_update", {
                    "agent": agent,
                    "output": output,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Start background streaming thread
    socketio.start_background_task(_terminal_stream_loop)
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
