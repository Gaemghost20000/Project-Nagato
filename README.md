# Project Nagato

Agent infrastructure — monitoring dashboard, watchdog, and Kubernetes deployment manifests for the Nagato AI agent system.

## Components

### Agent Cockpit (`cockpit/`)

Real-time monitoring dashboard for AI agents. Flask backend with WebSocket live terminal streaming, system metrics, and command dispatch.

- REST API + WebSocket for agent status, terminal capture, metrics
- Kubernetes deployment with Traefik ingress
- SSH-based tmux session capture (container-safe)

See [`cockpit/README.md`](./cockpit/README.md) for API docs and deployment instructions.

### Watchdog (`nagato-watchdog.sh`)

Auto-recovery script that monitors the Nagato tmux session. Restarts on crash with configurable cooldown, max restarts, and Telegram notifications.

```bash
# Run manually
bash nagato-watchdog.sh

# Or as a systemd service / background process
nohup bash nagato-watchdog.sh &
```

## Quick Start

```bash
# Clone
git clone https://github.com/Gaemghost20000/Project-Nagato.git
cd Project-Nagato

# Deploy cockpit to k3s
cd cockpit
bash k8s/build.sh
kubectl apply -f k8s/

# Start watchdog
bash nagato-watchdog.sh
```

## Requirements

- Python 3.12+
- Docker (for container build)
- k3s with Traefik ingress
- tmux (for agent sessions)
- SSH key access to agent hosts
