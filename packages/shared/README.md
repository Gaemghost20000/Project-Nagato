# Shared Utilities Package (@ai-dev-agent/shared)

This package contains shared TypeScript types, interfaces, enums, and constants utilized across multiple services and applications within the AI Dev Agent monorepo. Its primary purpose is to ensure consistency and type safety for data structures, especially for inter-service communication like WebSocket messages.

## Key Contents

-   **TypeScript Definitions (`src/types.ts`):**
    -   **WebSocket Message Contracts:** Defines the structure for all messages exchanged between the frontend (`apps/frontend`) and the backend (`packages/chat-service`) via WebSockets. This includes types for chat messages, LLM response chunks, tool requests, tool responses, session management, and error messages. Adherence to these contracts is crucial for reliable communication and is guided by the [WebSocket Message Contracts rule](../../.kilocode/rules/websocket-message-contracts.md).
    -   **General Shared Types:** May include other common data structures or enums used by multiple packages.

## Purpose

-   **Single Source of Truth:** Provides a centralized location for shared data definitions, preventing duplication and inconsistencies.
-   **Type Safety:** Enables TypeScript's static type checking across package boundaries, reducing runtime errors related to data format mismatches.
-   **Maintainability:** Simplifies updates to shared data structures, as changes only need to be made in one place.

## Usage

Other packages within the monorepo (e.g., `packages/chat-service`, `apps/frontend`) should list `@ai-dev-agent/shared` as a workspace dependency in their `package.json` files.

Example import in another package:

```typescript
import { ChatMessage, ToolRequestMessage } from '@ai-dev-agent/shared';

// Use the imported types
const myMessage: ChatMessage = { /* ... */ };
```

## Building

This package is typically built as part of the monorepo's overall build process managed by Turborepo.

To build it individually (from the monorepo root):
```bash
pnpm --filter @ai-dev-agent/shared build
```
This will compile the TypeScript files from `src/` to `dist/`. The `package.json` for this package points to `dist/index.js` as its main entry point and `dist/index.d.ts` for its types.