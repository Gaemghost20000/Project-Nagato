# Chat Service Package (@ai-dev-agent/chat-service)

Handles real-time chat functionalities, including message exchange with an LLM, streaming responses, and orchestrating backend tool execution via WebSockets. It serves as the primary backend for interactive chat sessions.

## Features

-   **Real-time Chat:** Facilitates interactive chat sessions with users.
-   **LLM Integration:** Connects to the `@ai-dev-agent/llm-gateway` to process user messages and generate AI responses.
-   **Streaming Responses:** Streams LLM responses chunk by chunk over WebSockets for a responsive user experience.
-   **Tool Handling:** Implements a `ToolRegistry` to manage and execute backend tools requested by the client or initiated by the LLM.
-   **WebSocket API:** Provides a WebSocket endpoint (`/ws`) for client communication.
-   **Shared Contracts:** Uses message contracts defined in the `@ai-dev-agent/shared` package for type-safe communication.
-   **Timestamped Messages:** All server-to-client WebSocket messages include a `timestamp` field for debugging and event ordering.

## Dependencies

-   **`@ai-dev-agent/llm-gateway`**: For accessing Large Language Models.
-   **`@ai-dev-agent/shared`**: For shared TypeScript types and interfaces, particularly WebSocket message contracts.
-   **Express**: For the underlying HTTP server.
-   **ws**: For WebSocket communication.

## WebSocket API

The service exposes a WebSocket endpoint at `/ws`. Clients communicate using JSON messages. Key message types are defined in `@ai-dev-agent/shared/types.ts`.

### Client to Server Messages:

-   **`session_init`**: Client signals readiness or confirms a session.
    -   Payload: `{ type: "session_init", sessionId: string }`
-   **`chat_message`**: Client sends a user's chat message.
    -   Payload: `{ type: "chat_message", sessionId: string, content: string, sender: "user" }`
-   **`tool_request`**: Client (or LLM via client proxy) requests the execution of a backend tool.
    -   Payload: `{ type: "tool_request", sessionId: string, toolCallId: string, toolName: string, arguments: Record<string, any> }`

### Server to Client Messages:

-   **`connection_ack`**: Sent upon successful WebSocket connection.
    -   Payload: `{ type: "connection_ack", connectionId: string, message: string, timestamp: string }`
-   **`session_confirmed`**: Confirms session initialization.
    -   Payload: `{ type: "session_confirmed", sessionId: string, timestamp: string }`
-   **`llm_chunk`**: A chunk of the LLM's streamed response.
    -   Payload: `{ type: "llm_chunk", sessionId: string, content_chunk: string, timestamp: string }`
-   **`llm_stream_end`**: Signals the end of an LLM response stream.
    -   Payload: `{ type: "llm_stream_end", sessionId: string, timestamp: string }`
-   **`tool_response`**: The result (or error) of a tool execution.
    -   Payload: `{ type: "tool_response", sessionId: string, toolCallId: string, toolName: string, response: any, isError: boolean, timestamp: string }`
-   **`error`**: General error message.
    -   Payload: `{ type: "error", sessionId?: string, error: string, timestamp: string }`

Refer to `packages/shared/src/types.ts` for the complete TypeScript interfaces for these messages.

## Tool Handling

The Chat Service can orchestrate the execution of backend tools.
-   Tools are registered in the `ToolRegistry`.
-   When a `tool_request` message is received, the service attempts to find and execute the corresponding tool.
-   The outcome is communicated back to the client via a `tool_response` message.
-   (Details on how to define and register new tools will be added here as the `ToolRegistry` implementation evolves.)

## Configuration

The service can be configured using environment variables (see also `.env.example`):

-   `PORT`: The port on which the service will listen. Defaults to `3001`.
-   `LLM_GATEWAY_URL`: The full URL for the LLM Gateway's chat completions endpoint. Defaults to `http://localhost:3002/v1/chat/completions`.
-   `CORS_ALLOWED_ORIGINS`: A comma-separated list of allowed origins for CORS. The service defaults to allowing:
    -   `http://localhost:3000` (Common Next.js dev port)
    -   `http://192.168.0.168:3000` (Network accessible dev port)
    -   `http://localhost:3003` (Observed frontend dev port)
    -   `http://192.168.0.168:3003` (Network accessible observed frontend dev port)

## Running the Service

From the monorepo root (`ai-dev-agent`):

-   **Development Mode (with hot-reloading):**
    ```bash
    pnpm --filter @ai-dev-agent/chat-service dev
    ```
-   **Production Mode:**
    ```bash
    pnpm --filter @ai-dev-agent/chat-service build
    pnpm --filter @ai-dev-agent/chat-service start
    ```

The service also implements a `/health` GET endpoint which returns `{"status": "UP"}` if the service is running.