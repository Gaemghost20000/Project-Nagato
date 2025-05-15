// WebSocket Message Types
// This file defines the TypeScript interfaces for messages exchanged over WebSockets
// between the frontend and backend services (primarily chat-service).
// Adhering to the websocket-message-contracts.md rule, these types ensure
// consistency and type safety in communication.

/**
 * Defines all possible types of messages that can be sent over WebSocket.
 * This union type is used in BaseWebSocketMessage to discriminate between
 * different message structures.
 */
export type WebSocketMessageType =
  | 'chat_message'      // User-initiated chat message from client to server
  | 'llm_chunk'         // A chunk of an LLM response streamed from server to client
  | 'llm_stream_end'    // Signals the end of an LLM response stream
  | 'connection_ack'    // Server acknowledges a new WebSocket connection
  | 'session_confirmed' // Server confirms session establishment or re-establishment
  | 'tool_request'      // Server requests the client (or an agent) to execute a tool
  | 'tool_response'     // Client (or an agent) sends back the result of a tool execution
  | 'error';            // An error message from server to client

/**
 * Base interface for all WebSocket messages.
 * It includes common fields like `type` for message discrimination
 * and `timestamp`. `sessionId` is optional as some initial messages
 * (like connection_ack) might not have a session yet.
 */
export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  sessionId?: string; // Optional for messages like connection_ack or global errors
  timestamp: string;  // ISO 8601 format (e.g., new Date().toISOString())
}

/**
 * Message sent from the client to the server when a user sends a chat message.
 * `sessionId` is crucial for routing the message to the correct chat session on the server.
 */
export interface ClientChatMessage extends BaseWebSocketMessage {
  type: 'chat_message';
  sessionId: string;
  content: string;
  // messageId?: string; // Optional: Client-generated ID for tracking, if needed
}

/**
 * Message sent from the server (chat-service) to the client, containing a chunk
 * of an LLM's response. This is used for streaming.
 * `messageId` can link chunks to a specific agent message.
 */
export interface LLMChunkMessage extends BaseWebSocketMessage {
  type: 'llm_chunk';
  sessionId: string;
  content_chunk: string;
  messageId?: string; // ID of the agent message being streamed
}

/**
 * Message sent from the server (chat-service) to the client to signal
 * that the LLM response stream for a particular message has ended.
 * `messageId` identifies the agent message that has finished streaming.
 */
export interface LLMStreamEndMessage extends BaseWebSocketMessage {
  type: 'llm_stream_end';
  sessionId: string;
  messageId?: string; // ID of the agent message that just finished streaming
}

/**
 * Message sent from the server to the client upon successful WebSocket connection.
 * Includes a `connectionId` assigned by the server.
 */
export interface ConnectionAckMessage extends BaseWebSocketMessage {
  type: 'connection_ack';
  // sessionId is not applicable here as it's pre-session
  connectionId: string;
  message: string; // e.g., "Connection acknowledged"
}

/**
 * Message sent from the server (chat-service) to the client to confirm
 * that a session has been successfully established or re-established.
 */
export interface SessionConfirmedMessage extends BaseWebSocketMessage {
  type: 'session_confirmed';
  sessionId: string;
}

/**
 * Message sent from the server to the client when an error occurs.
 * `sessionId` is optional as some errors might be global or occur before a session is established.
 * `details` can contain additional structured error information.
 */
export interface ErrorMessage extends BaseWebSocketMessage {
  type: 'error';
  // sessionId?: string; // Session ID might not always be available or relevant for all errors
  error: string;      // A human-readable error message
  details?: any;      // Additional error details, could be an error object or stack trace
}

/**
 * Placeholder for messages sent from the server to the client (or an agent)
 * requesting the execution of a tool.
 * `toolCallId` is a unique identifier for this specific tool invocation request.
 */
export interface ToolRequestMessage extends BaseWebSocketMessage {
  type: 'tool_request';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  arguments: any; // Arguments for the tool, structure depends on the tool
}

/**
 * Placeholder for messages sent from the client (or an agent) back to the server
 * with the result of a tool execution.
 * `toolCallId` links this response to the original `ToolRequestMessage`.
 * `isError` indicates if the tool execution resulted in an error.
 */
export interface ToolResponseMessage extends BaseWebSocketMessage {
  type: 'tool_response';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  response: any;    // The result from the tool. Structure depends on the tool.
  isError?: boolean; // True if the tool execution failed
}

// Tool Service Interfaces
// These interfaces define the contract for tool services and their outputs,
// facilitating a modular and extensible tool orchestration system within chat-service.

/**
 * Defines the structure of the output returned by an IAgentTool's execute method.
 * This structure is designed to be compatible with the `ToolResponseMessage`.
 */
export interface ToolOutput {
  response: any;    // The result from the tool. Structure depends on the tool.
  isError?: boolean; // True if the tool execution failed.
  // Optional: errorDetails?: any; // Can be used for more structured error information from the tool.
}

/**
 * Represents the contract for any tool that can be invoked by the agent system.
 * Chat-service will use implementations of this interface (e.g., an HTTP client wrapper)
 * to interact with various tool services.
 */
export interface IAgentTool {
  /**
   * The unique name of the tool, matching `toolName` in `ToolRequestMessage`.
   * This name is used by the ToolRegistry to identify and dispatch to the correct tool.
   */
  readonly name: string;

  /**
   * A human-readable description of what the tool does, its expected arguments,
   * and the structure of its output. This can be used for documentation or
   * potentially by an LLM to decide which tool to use.
   */
  readonly description: string;

  /**
   * Executes the tool with the provided arguments.
   * @param args The arguments for the tool, as received in `ToolRequestMessage.arguments`.
   * @param toolCallId The unique identifier for this specific tool invocation, used for tracking.
   * @param sessionId The ID of the session initiating the tool call, for context or logging.
   * @returns A Promise that resolves to a `ToolOutput` object containing the tool's result.
   */
  execute(
    args: any,
    toolCallId: string,
    sessionId: string,
  ): Promise<ToolOutput>;
}
// Union type for all possible messages that the server might send to the client.
// Useful for type guards on the client side.
export type ServerToClientMessage =
  | LLMChunkMessage
  | LLMStreamEndMessage
  | ConnectionAckMessage
  | SessionConfirmedMessage
  | ErrorMessage
  | ToolRequestMessage; // Server can request tool execution

// Union type for all possible messages that the client might send to the server.
// Useful for type guards on the server side.
export type ClientToServerMessage =
  | ClientChatMessage
  | ToolResponseMessage; // Client responds to tool requests