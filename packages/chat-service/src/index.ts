/**
 * Main entry point for the chat-service package.
 * This file exports the public API of the service.
 */

export { ChatService } from './chat.service';
export type { ChatMessage, ChatSession } from './chat.service';

console.log('Chat service loaded'); // Basic log to confirm loading