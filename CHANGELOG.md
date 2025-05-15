# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Commits should follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## [Unreleased] - 2025-05-16

### Features
- **chat-service:** Implement initial tool request handling via WebSockets, allowing the frontend to request backend tool execution.
- **chat-service:** Introduce `ToolRegistry` for managing and dispatching tool calls within the chat service.
- **chat-service:** Add `timestamp` to outgoing WebSocket messages (`llm_chunk`, `llm_stream_end`, `error`, `session_confirmed`, `connection_ack`) for improved debugging and event ordering.
- **llm-gateway:** Add support for optional `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` environment variables to send `HTTP-Referer` and `X-Title` headers to OpenRouter, aiding in analytics and identification.
- **llm-gateway:** Enhance error reporting from upstream LLM providers by returning more detailed and structured JSON error responses to the client.
- **shared:** Activate `packages/shared` by exporting TypeScript types and interfaces, particularly for WebSocket message contracts, enabling type-safe communication between services.

### Fixes
- **chat-service:** Improve robustness of error handling and logging during the streaming of LLM responses.
- **chat-service:** Update Cross-Origin Resource Sharing (CORS) configuration to include `http://localhost:3003` and `http://192.168.0.168:3003` as allowed origins, reflecting the frontend's actual development port.

### Build
- **monorepo:** Add `@ai-dev-agent/shared` as a workspace dependency to `packages/chat-service` in `pnpm-lock.yaml` to enable usage of shared types.

### Chores
- **monorepo:** Update Turborepo configuration file (`turbo.json`) to use the `tasks` key instead of the deprecated `pipeline` key.
- **project:** Remove large, previously generated file `Output/Output_local.md`.