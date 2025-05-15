/**
 * Defines the structure for a message within a chat session.
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Defines the structure for a chat session.
 */
export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the LLM Gateway service.
 * This defines the contract ChatService expects for generating responses.
 */
export interface ILLMGatewayService {
  /**
   * Generates a streaming response from the LLM based on the given prompt.
   * @param prompt The input string to send to the LLM.
   * @returns An AsyncIterable that yields response chunks (strings) from the LLM.
   */
  generateResponse(prompt: string): AsyncIterable<string>;
}

/**
 * ChatService manages chat sessions and messages.
 * It now integrates with an LLM gateway to provide dynamic agent responses.
 */
export class ChatService {
  private sessions: Map<string, ChatSession>;

  /**
   * Creates an instance of ChatService.
   * @param llmGatewayService An instance of a service that implements ILLMGatewayService,
   *                          used to generate responses from an LLM.
   */
  constructor(private readonly llmGatewayService: ILLMGatewayService) {
    this.sessions = new Map<string, ChatSession>();
  }

  /**
   * Generates a simple unique ID.
   * In a real application, a more robust UUID generator should be used.
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Creates a new chat session.
   * @returns A Promise that resolves to the newly created ChatSession.
   */
  async createSession(): Promise<ChatSession> {
    const sessionId = this.generateId();
    const now = new Date();
    const newSession: ChatSession = {
      sessionId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, newSession);
    console.log(`[ChatService] Session created: ${sessionId}`);
    return newSession;
  }

  /**
   * Sends a message to a chat session.
   * If the sender is 'user', an automatic agent acknowledgment is also created.
   * @param sessionId The ID of the session to send the message to.
   * @param content The content of the message.
   * @param sender The sender of the message ('user' or 'agent').
   * @returns A Promise that resolves to the agent's response ChatMessage if sender is 'user',
   *          or the sent ChatMessage if sender is 'agent'.
   * @throws Error if the session is not found.
   */
  async sendMessage(
    sessionId: string,
    content: string,
    sender: 'user' | 'agent'
  ): Promise<ChatMessage | AsyncIterable<string>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[ChatService] Session not found: ${sessionId}`);
      throw new Error(`Session with ID "${sessionId}" not found.`);
    }

    const messageToStore: ChatMessage = {
      id: this.generateId(),
      sessionId,
      sender,
      content,
      timestamp: new Date(),
    };
    session.messages.push(messageToStore);
    session.updatedAt = new Date();
    console.log(`[ChatService] Message stored for session ${sessionId}: ${content} by ${sender}`);
    // Save session changes immediately after storing the incoming message
    this.sessions.set(sessionId, session);

    if (sender === 'user') {
      // User message is stored. Now, initiate streaming response from LLM.
      // The ChatService is no longer responsible for creating and storing the agent's ChatMessage from the stream.
      // That responsibility shifts to the consumer of the stream (e.g., the WebSocket handler in server.ts),
      // which can accumulate chunks and then decide how/if to store the full agent response.
      return this.llmGatewayService.generateResponse(content);
    }
    
    // If sender is not 'user' (e.g., 'agent' sending a pre-canned message, or 'system')
    // return the message that was just stored.
    return messageToStore;
  }

  /**
   * Retrieves the chat history for a given session.
   * @param sessionId The ID of the session to retrieve history from.
   * @returns A Promise that resolves to an array of ChatMessages.
   * @throws Error if the session is not found.
   */
  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[ChatService] Session not found when getting history: ${sessionId}`);
      throw new Error(`Session with ID "${sessionId}" not found.`);
    }
    console.log(`[ChatService] History retrieved for session ${sessionId}: ${session.messages.length} messages`);
    return session.messages;
  }
}