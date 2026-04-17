# Agent Cockpit

Real-time monitoring dashboard for AI agents (Nagato and Hermes). Provides live terminal streaming, system metrics, and command dispatch via REST API and WebSockets.

## Architecture

- **Backend:** Flask + Flask-SocketIO (Python)
- **Frontend:** Single-page HTML/CSS/JS dashboard (embedded in `static/index.html`)
- **Deployment:** Kubernetes (k3s) with Traefik ingress
- **Agent Access:** SSH to localhost for tmux session capture (container can't access host tmux socket directly due to PID namespace isolation)

## Features

- REST API for agent status, terminal capture, metrics, and command dispatch
- WebSocket live terminal streaming (2s polling interval)
- Multi-agent support (Nagato on VM, Hermes on Termux device)
- System metrics (CPU, memory, disk, uptime)
- Kubernetes-native deployment with host networking

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/agents` | GET | List agents and their status |
| `/api/agents/<name>/terminal` | GET | Capture terminal output (query: `lines`) |
| `/api/agents/<name>/metrics` | GET | Get system metrics |
| `/api/agents/<name>/command` | POST | Send command to agent tmux session |
| `/api/agents/<name>/active` | POST | Set active agent |

## WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `connect` | Client->Server | Returns connection status |
| `subscribe_terminal` | Client->Server | Subscribe to terminal updates for an agent |
| `terminal_update` | Server->Client | Terminal output snapshot (every 2s) |
| `set_active` | Client->Server | Switch active agent |

## Deployment

### Build and deploy to k3s

```bash
cd k8s
bash build.sh
kubectl apply -f deployment.yaml -f service.yaml -f ingress.yaml
```

### Configuration

| Variable | Default | Description |
|---|---|---|
| `SSH_KEY_PATH` | `~/.ssh/id_ed25519_gaem` | SSH key for agent access |
| `NAGATO_HOST` | `100.72.58.50` | Tailscale IP of Nagato VM |
| `NAGATO_USER` | `hermes` | SSH user for Nagato |
| `SECRET_KEY` | (generated) | Flask secret key |

### K8s Resources

- `deployment.yaml` - Pod with host networking, tmux socket mount, SSH key mount
- `service.yaml` - ClusterIP service on port 80 -> 5000
- `ingress.yaml` - Traefik ingress at `cockpit.local`

## Requirements

```
flask>=3.0,<4.0
flask-socketio>=5.3,<6.0
paramiko>=3.4,<4.0
eventlet>=0.35,<1.0
```

## Known Limitations

- Hermes terminal requires SSH access to the Termux device (currently offline)
- Container uses SSH fallback for tmux capture (direct socket access blocked by PID namespace)
