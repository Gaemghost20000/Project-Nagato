# AI Dev Agent

The AI Dev Agent is a local-first AI-powered development assistant designed to run on your machine. It leverages local and remote Language Models (LLMs) and a suite of tools to help with various software development tasks, providing a secure, responsive, and customizable coding companion.

## Key Features & Current Capabilities

*   **Monorepo Architecture:** Organized using `pnpm` workspaces and Turborepo for efficient build and dependency management.
*   **LLM Gateway (`packages/llm-gateway`):**
    *   Acts as a unified interface to LLMs (currently supports Ollama and OpenRouter).
    *   OpenAI-compatible API endpoint (`/v1/chat/completions`) for easy integration.
    *   Supports streaming responses.
*   **Chat Service (`packages/chat-service`):**
    *   Manages chat interactions and state.
    *   WebSocket endpoint (`/ws`) for real-time, bidirectional communication.
    *   Forwards user messages to the LLM Gateway and streams responses back.
    *   Supports dynamic tool registration and execution (e.g., an HTTP tool for making external requests).
*   **Frontend (`apps/frontend`):**
    *   Basic chat interface built with Next.js and Tailwind CSS.
    *   Connects to the Chat Service via WebSockets.
    *   Sends user messages and displays streamed AI responses in real-time.
*   **Shared Utilities (`packages/shared`):**
    *   Provides shared TypeScript types and interfaces, including WebSocket message contracts.

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18.x or later recommended)
*   [pnpm](https://pnpm.io/installation) (v9.x or later recommended)
*   (Optional) [Ollama](https://ollama.com/) installed and running if you intend to use local models.
    *   Ensure you have pulled a model, e.g., `ollama pull llama3`
*   (Optional) An [OpenRouter API Key](https://openrouter.ai/) if you intend to use models via OpenRouter.

## Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Gaemghost20000/Project-Nagato.git
    cd Project-Nagato/ai-dev-agent
    ```

2.  **Install dependencies:**
    From the `ai-dev-agent` root directory:
    ```bash
    pnpm install
    ```

## Environment Variables

Each service uses `.env` files for configuration. Example files (`.env.example`) are provided in the respective package directories. Copy them to `.env` and fill in the required values.

*   **`packages/llm-gateway/.env.example`**:
    *   `PORT`: Port for the LLM Gateway (e.g., 3000).
    *   `OLLAMA_API_BASE_URL`: URL for your local Ollama instance (e.g., `http://localhost:11434`).
    *   `OPENROUTER_API_KEY`: (Optional) Your OpenRouter API key.
    *   `DEFAULT_LLM_PROVIDER`: `ollama` or `openrouter`.
    *   `DEFAULT_OLLAMA_MODEL`: Default Ollama model to use (e.g., `llama3`).
    *   `DEFAULT_OPENROUTER_MODEL`: Default OpenRouter model to use (e.g., `openai/gpt-3.5-turbo`).

*   **`packages/chat-service/.env.example`**:
    *   `PORT`: Port for the Chat Service (e.g., 3002).
    *   `LLM_GATEWAY_URL`: URL of your LLM Gateway (e.g., `http://localhost:3000`).

*   **`apps/frontend/.env.local.example`** (rename to `.env.local`):
    *   `NEXT_PUBLIC_CHAT_SERVICE_WSS_URL`: WebSocket URL for your Chat Service (e.g., `ws://localhost:3002`).

## Running the Application

You need to start each service in a separate terminal from the `ai-dev-agent` root directory.

1.  **Start the LLM Gateway:**
    ```bash
    pnpm --filter @ai-dev-agent/llm-gateway dev
    ```
    Or to run the compiled version:
    ```bash
    pnpm --filter @ai-dev-agent/llm-gateway build
    pnpm --filter @ai-dev-agent/llm-gateway start
    ```

2.  **Start the Chat Service:**
    ```bash
    pnpm --filter @ai-dev-agent/chat-service dev
    ```
    Or to run the compiled version:
    ```bash
    pnpm --filter @ai-dev-agent/chat-service build
    pnpm --filter @ai-dev-agent/chat-service start
    ```

3.  **Start the Frontend Application:**
    ```bash
    pnpm --filter @ai-dev-agent/frontend dev
    ```
    The frontend will typically be available at `http://localhost:3001`.

## Project Structure

*   **`apps/`**: Contains standalone applications.
    *   `frontend/`: The Next.js chat interface.
*   **`packages/`**: Contains shared libraries and services (TypeScript).
    *   `llm-gateway/`: Service to interface with LLMs.
    *   `chat-service/`: Service for chat logic and WebSocket communication.
    *   `shared/`: Shared types, interfaces, and utilities.
    *   `file-manager/`, `scraper-service/`, `terminal-service/`: Placeholder packages for future tools.
*   **`agent-cockpit/`**: Real-time monitoring dashboard (Python/Flask).
    *   REST API + WebSocket live terminal streaming for agent monitoring.
    *   Kubernetes deployment manifests (k3s with Traefik ingress).
    *   See [`agent-cockpit/README.md`](./agent-cockpit/README.md) for details.
*   **`scripts/`**: Operational scripts.
    *   `nagato-watchdog.sh`: Auto-recovery watchdog that monitors the Nagato tmux session and restarts on crash.
*   **`canvas/`**: Design documents and research findings.
*   **`docs/`**: Further documentation, including tool server specifications.

## Contributing

Contributions are welcome! Please refer to the existing code style and commit conventions (Conventional Commits).

---

*This README provides an overview of the AI Dev Agent project. For more detailed design documents and reflections on earlier development stages, please see the files in the [`canvas/`](./canvas/) directory and the previous version of this README (now potentially in commit history or a separate `SUMMARY.md` if preserved).*