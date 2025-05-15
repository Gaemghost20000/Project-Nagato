# Terminal Execution Server Documentation

## 1. Introduction

### 1.1. Overview of the Tool's Purpose
The Terminal Execution Server provides a secure, auditable, and controlled environment for executing shell commands remotely. It is designed to allow clients to run predefined or authorized commands on isolated environments, stream output in real time, and manage command lifecycle, all while enforcing strict security and resource controls.

### 1.2. Purpose and Goals of its Dedicated Server Implementation
**Purpose:**
- Enable remote, programmatic execution of shell commands for automation, CI/CD, diagnostics, and DevOps workflows.
- Ensure all executions are sandboxed, logged, and authorized.

**Goals:**
- **Security:** Prevent command injection, privilege escalation, and unauthorized access.
- **Isolation:** Run each command in a containerized environment (Docker) to prevent interference and data leakage.
- **Observability:** Stream stdout/stderr in real time, log all executions, and provide audit trails.
- **Control:** Allow clients to terminate commands, set timeouts, and restrict resource usage.
- **Extensibility:** Support new command types, environments, and integration with orchestration systems.

### 1.3. Intended Audience for This Documentation
- DevOps engineers and SREs
- Backend/API developers
- Security and compliance teams
- System integrators

## 2. System Architecture

### 2.1. High-level Architectural Diagram (Mermaid Syntax)
```mermaid
graph TD
    A[Client Application] -- REST/JSON --> B(Terminal Execution API Server)
    B -- Command Request --> C{Command Validator & Authorizer}
    C -- Validated Command --> D[Execution Manager]
    D -- Launches --> E[Docker Container (Isolated Shell)]
    E -- Streams stdout/stderr --> F[WebSocket Server]
    F -- Streams output --> A
    D -- Updates --> G[Execution State Store (in-memory/DB)]
    D -- Logs --> H[Centralized Logging]
    B -- Health/Status --> I[Monitoring/Alerting]
    B -- Authenticates --> J[API Key/JWT Store]
```

### 2.2. Narrative Explaining the Server's Components, Modules, and Their Interconnections
- **API Server:** Exposes REST endpoints for command submission, status, and termination. Handles authentication and initial validation.
- **Command Validator & Authorizer:** Checks if the requested command is allowed, validates arguments, and enforces user permissions.
- **Execution Manager:** Orchestrates the lifecycle of each command execution, including container creation, timeout enforcement, and resource limits.
- **Docker Container:** Each command runs in its own container, ensuring process and filesystem isolation.
- **WebSocket Server:** Streams real-time stdout/stderr to the client and optionally receives stdin.
- **Execution State Store:** Tracks running, completed, and failed executions, storing metadata and results.
- **Centralized Logging:** Captures all command invocations, outputs, and errors for audit and debugging.
- **Monitoring/Alerting:** Exposes health and metrics endpoints for observability.
- **API Key/JWT Store:** Manages authentication credentials and access control.

### 2.3. Technology Stack Choices and Rationale
- **Go:** Efficient concurrency, strong system-level APIs, and static binaries.
- **Docker:** Industry-standard containerization for process isolation.
- **WebSocket (nhooyr.io/websocket):** Real-time, bidirectional streaming of command I/O.
- **Gin or Chi (Go HTTP routers):** For REST API routing and middleware.
- **BoltDB/SQLite (optional):** For persistent execution metadata if needed.
- **Prometheus/Grafana:** For monitoring and alerting.

## 3. Core Components & Logic

### 3.1. Detailed Explanation of Each Primary Module and Its Responsibilities
- **API Handler:** Receives and validates requests, authenticates users, and returns execution IDs and WebSocket URLs.
- **Command Validator:** Checks command against allowlist, validates arguments, and enforces per-user or per-role restrictions.
- **Execution Manager:**
    - Spawns Docker containers with specified command and environment.
    - Sets resource limits (CPU, memory, disk, network).
    - Tracks process state and enforces timeouts.
    - Handles termination requests.
- **WebSocket Handler:**
    - Streams stdout/stderr to client as JSON messages.
    - Optionally receives stdin from client.
    - Sends exit code and final status.
- **State Store:**
    - Maintains execution metadata (ID, user, command, status, timestamps, exit code).
    - Optionally persists to disk or database.
- **Logging:**
    - Captures all command invocations, arguments, outputs, and errors.
    - Supports structured (JSON) logs for auditability.

### 3.2. Algorithms, Data Processing Pipelines, and Decision-Making Logic
- **Submission Pipeline:**
    1. Client submits command via REST API.
    2. API authenticates and validates request.
    3. Command is checked against allowlist and user permissions.
    4. Execution Manager launches Docker container and starts command.
    5. Execution ID and WebSocket URL are returned.
- **Execution Pipeline:**
    1. Client connects to WebSocket for real-time I/O.
    2. Server streams stdout/stderr as JSON messages.
    3. Client can send stdin (if enabled).
    4. On completion, server sends exit code and closes connection.
    5. Execution metadata is logged and stored.
- **Termination Pipeline:**
    1. Client sends stop request via REST API.
    2. Execution Manager kills the process/container.
    3. Final status is logged and reported.

### 3.3. Security Model for Command Execution, Session Management, Input/Output Streaming
- **Command Allowlist:** Only pre-approved commands (and arguments) are executable.
- **Container Isolation:** Each execution runs in a fresh Docker container with minimal privileges (no root, no host mounts).
- **Resource Limits:** CPU, memory, disk, and network are capped per execution.
- **Timeouts:** All executions have a maximum allowed runtime.
- **Authentication:** API keys or JWTs required for all endpoints and WebSocket connections.
- **Audit Logging:** All actions are logged with user, command, and result.
- **Session Management:** Execution state is tracked and can be queried or terminated by authorized users.

## 4. API Design

### 4.1. Detailed Specification of All API Endpoints
- **POST /execute**: Submit a command for execution.
    - Request: `{ "command_id": "string", "args": ["arg1", ...], "timeout": "30s", "env": {"VAR": "value"} }`
    - Response: `{ "execution_id": "string", "websocket_url": "wss://host/ws/{execution_id}" }`
- **POST /execute/{execution_id}/stop**: Terminate a running command.
    - Response: `{ "status": "terminated" }`
- **GET /execute/{execution_id}/status**: Get status and metadata for a command.
    - Response: `{ "status": "running|completed|failed|terminated", "exit_code": int, ... }`
- **WebSocket /ws/{execution_id}**: Real-time I/O streaming.
    - Server sends: `{ "type": "stdout|stderr|exit", "data": "...", "timestamp": "..." }`
    - Client can send: `{ "type": "stdin", "data": "..." }`

### 4.2. Request/Response Schemas (JSON)
- See above for examples. All data is JSON, with output lines base64-encoded if binary.

### 4.3. Authentication and Authorization Mechanisms
- API keys or JWTs required for all endpoints and WebSocket connections.
- Role-based access control (RBAC) for command permissions.

### 4.4. Rate Limiting and Throttling Strategies
- Per-user and global rate limits on command submissions and concurrent executions.
- HTTP 429 returned if exceeded.

### 4.5. Error Handling and Status Codes
- Standard HTTP codes: 200, 201, 202, 400, 401, 403, 404, 409, 429, 500.
- JSON error bodies: `{ "error": "message" }`

## 5. Data Management

### 5.1. Description of Data Sources
- User input (command, args, env vars).
- Execution metadata (status, timestamps, exit code).

### 5.2. Data Storage Solutions
- In-memory store for active executions.
- Optional persistent store (BoltDB, SQLite, or external DB) for audit logs and history.

### 5.3. Data Flow Within the Server
- Request → Validation → Execution → Streaming → Logging → Status/Result

### 5.4. Data Security, Privacy Measures, and Compliance Considerations
- All sensitive data (API keys, execution logs) stored securely.
- No user secrets are exposed to other users.
- All logs are access-controlled.

### 5.5. Data Backup and Recovery Strategy
- If persistent store is used, regular backups and point-in-time recovery.
- In-memory state is ephemeral; recommend external logging for audit.

## 6. Dependencies & Prerequisites

### 6.1. Software, Libraries, SDKs, and Services
- Go 1.20+
- Docker Engine (19.03+)
- go-chi/chi or gin-gonic/gin (router)
- nhooyr.io/websocket (WebSocket)
- Prometheus client (monitoring)
- BoltDB/SQLite (optional, for persistence)

### 6.2. System-Level Dependencies
- Linux OS (with Docker)
- Sufficient CPU/RAM for containers
- Docker group permissions for the server process

### 6.3. External Services Setup
- Docker must be installed and running.
- (Optional) Set up Prometheus/Grafana for monitoring.

## 7. Step-by-Step Installation & Configuration Guide

### 7.1. Development Environment Setup
1. Install Go and Docker.
2. Clone the repository.
3. Copy `.env.example` to `.env` and set API keys, allowed commands, and Docker image.
4. Run `go mod download` to install dependencies.

### 7.2. Cloning the Repository
```bash
git clone <repo_url>
cd terminal-execution-server
```

### 7.3. Installing Dependencies
```bash
go mod download
```

### 7.4. Configuration
- Edit `.env` or config file for API keys, allowed commands, Docker image, and resource limits.

### 7.5. Running the Server Locally
```bash
go run main.go
```

### 7.6. Initial Data Seeding
- Add allowed commands to the config file.

## 8. Deployment Strategy

### 8.1. Production Deployment
- Build static Go binary: `go build -o terminal-server main.go`
- Use Docker Compose or Kubernetes for orchestration.
- Use environment variables or secrets manager for sensitive config.

### 8.2. Containerization
- Provide a `Dockerfile` for the server.
- Use Docker Compose to run server and Docker-in-Docker if needed.

### 8.3. Orchestration
- Kubernetes Deployment and Service manifests.
- Use ConfigMaps and Secrets for configuration.

### 8.4. CI/CD Pipeline
- Lint, test, build, and push Docker image.
- Deploy to staging/production on merge.

### 8.5. Environment-Specific Configurations
- Use separate config for dev, staging, prod.

## 9. Security Considerations

### 9.1. Potential Vulnerabilities
- Command injection, privilege escalation, container breakout, resource exhaustion, unauthorized access.

### 9.2. Mitigation Strategies
- Strict allowlist, container isolation, resource limits, timeouts, audit logging, RBAC, regular dependency updates.

### 9.3. Secure Handling of Secrets
- Use environment variables or secrets manager.
- Never log secrets.

## 10. Monitoring, Logging, & Alerting

### 10.1. Key Metrics
- Command execution count, error rate, resource usage, active executions, API latency.

### 10.2. Logging Practices
- Structured JSON logs, log rotation, correlation IDs.

### 10.3. Alerting
- Alert on high error rates, resource exhaustion, failed executions.

### 10.4. Health Check Endpoint
- `GET /healthz` returns 200 if healthy.

## 11. Scalability & Performance

### 11.1. Scaling
- Run multiple server instances behind a load balancer.
- Scale Docker host resources as needed.

### 11.2. Performance Optimization
- Reuse Docker images, pre-warm containers, efficient I/O streaming.

### 11.3. Load Testing
- Use k6, vegeta, or custom scripts to simulate concurrent executions.

## 12. Example Usage & Integration

### 12.1. Code Snippets
```bash
curl -X POST -H "Authorization: Bearer <token>" -d '{"command_id":"ls","args":["-la"]}' https://host/execute
# Connect to wss://host/ws/<execution_id> for output
```

### 12.2. Walkthrough
- Submit a command, connect to WebSocket, receive output, terminate if needed.

### 12.3. Integration
- Integrate with CI/CD, monitoring, or orchestration tools.

## 13. Troubleshooting Guide

### 13.1. Common Problems
- Docker not running, permission denied, command not allowed, API key invalid.

### 13.2. Debugging Tips
- Check logs, verify Docker status, test with allowed commands, check resource limits.

## 14. Future Enhancements

### 14.1. Future Directions
- Support for interactive shells, SSH tunneling, advanced RBAC, multi-host execution, Windows containers.

### 14.2. Areas for Improvement
- More granular resource controls, better error reporting, UI dashboard, advanced audit features. 