import * as dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express, { Request, Response } from 'express';
import cors from 'cors'; // Added CORS
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatService, ILLMGatewayService, ChatMessage, ChatSession } from './chat.service';
import { v4 as uuidv4 } from 'uuid'; // For generating unique connection IDs if needed

// Helper type guard to check if an object is an AsyncIterable
function isAsyncIterable<T>(item: any): item is AsyncIterable<T> {
    return item != null && typeof item[Symbol.asyncIterator] === 'function';
}

// --- LLM Gateway Service Implementation for Streaming ---
/**
 * @class LLMGatewayServiceImpl
 * @implements {ILLMGatewayService}
 * Provides an implementation for ILLMGatewayService that interacts with the LLM Gateway,
 * supporting streaming responses.
 */
class LLMGatewayServiceImpl implements ILLMGatewayService {
  private llmGatewayUrl: string;

  constructor() {
    const url = process.env.LLM_GATEWAY_URL;
    if (!url) {
      console.error("LLM_GATEWAY_URL environment variable is not set.");
      throw new Error("LLM_GATEWAY_URL is not configured.");
    }
    this.llmGatewayUrl = url;
    console.log(`[LLMGatewayService] Initialized with URL: ${this.llmGatewayUrl}`);
  }

  /**
   * Generates a streaming response from the LLM based on the given prompt.
   * It makes a POST request to the llm-gateway's /v1/chat/completions endpoint
   * with stream: true and processes the Server-Sent Events (SSE) response.
   * @param prompt The input string to send to the LLM.
   * @returns An AsyncIterable that yields response chunks (strings) from the LLM.
   */
  async *generateResponse(prompt: string): AsyncIterable<string> {
    console.log(`[LLMGatewayService] Sending prompt to LLM Gateway: "${prompt}"`);
    const response = await fetch(`${this.llmGatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream', // Important for SSE
      },
      body: JSON.stringify({
        // Assuming a common payload structure, adjust if llm-gateway expects differently
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[LLMGatewayService] Error from LLM Gateway: ${response.status} - ${response.statusText}`, errorBody);
      throw new Error(`LLM Gateway request failed with status ${response.status}: ${errorBody}`);
    }

    if (!response.body) {
      console.error('[LLMGatewayService] Response body is null');
      throw new Error('Response body is null from LLM Gateway');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      console.log('[LLMGatewayService] Starting to read stream from LLM Gateway...');
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[LLMGatewayService] Stream ended.');
          if (buffer.trim().length > 0) {
            console.warn('[LLMGatewayService] Trailing data in buffer after stream ended:', buffer);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        let lineEndIndex;
        while ((lineEndIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.substring(0, lineEndIndex).trim();
          buffer = buffer.substring(lineEndIndex + 1);

          if (line.startsWith('data: ')) {
            const jsonData = line.substring('data: '.length).trim();
            if (jsonData === '[DONE]') {
              console.log('[LLMGatewayService] Received [DONE] signal from stream.');
              return; // End the generator
            }
            if (jsonData) {
              try {
                const parsed = JSON.parse(jsonData);
                // Assuming OpenAI-compatible stream format
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                  if (typeof parsed.choices[0].delta.content === 'string') {
                    // console.log(`[LLMGatewayService] Yielding chunk: "${parsed.choices[0].delta.content}"`);
                    yield parsed.choices[0].delta.content;
                  }
                  // finish_reason can also be checked here if needed
                }
              } catch (e: any) {
                console.error('[LLMGatewayService] Error parsing SSE JSON data:', jsonData, e.message);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[LLMGatewayService] Error reading stream:', error.message, error.stack);
      throw error;
    } finally {
      if (reader && !reader.closed) {
        reader.cancel().catch(e => console.error('[LLMGatewayService] Error cancelling reader:', e));
      }
      console.log('[LLMGatewayService] Stream processing finished.');
    }
  }
}

// --- Service Initialization ---
const llmGatewayService: ILLMGatewayService = new LLMGatewayServiceImpl();
const chatService = new ChatService(llmGatewayService);

// --- Express App Setup ---
const app = express();

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000', // Default Next.js dev port
  'http://192.168.0.168:3000', // As seen in the screenshot
  'http://192.168.0.168:3001', // Frontend origin from error log
  // Add any other origins you need to support, or use environment variables
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true, // If you need to handle cookies or authorization headers
};

app.use(cors(corsOptions));
// Handle pre-flight requests for all routes
app.options('*', cors(corsOptions));

app.use(express.json()); // Middleware to parse JSON request bodies

// --- HTTP API Endpoints ---
const chatApiRoutes = express.Router();

/**
 * @swagger
 * /api/chat/sessions:
 *   post:
 *     summary: Create a new chat session
 *     responses:
 *       201:
 *         description: Chat session created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatSession'
 *       500:
 *         description: Failed to create session.
 */
chatApiRoutes.post('/sessions', async (req: Request, res: Response) => {
  try {
    const session = await chatService.createSession();
    console.log(`[Server] Session created via HTTP: ${session.sessionId}`);
    res.status(201).json(session);
  } catch (error: any) {
    console.error('[Server] Error creating session via HTTP:', error.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * @swagger
 * /api/chat/sessions/{sessionId}/messages:
 *   post:
 *     summary: Send a message to a chat session (primarily for non-streaming or initial message)
 *     description: >
 *       Stores the user's message. For streaming AI responses, clients should use the WebSocket connection.
 *       If a 'user' message is sent, this endpoint returns a 202 Accepted, and the AI response
 *       will be streamed over WebSocket. If an 'agent' message is sent, it's stored and returned.
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageContent:
 *                 type: string
 *                 description: The content of the message.
 *               sender:
 *                 type: string
 *                 enum: [user, agent]
 *                 default: user
 *                 description: The sender of the message.
 *             required:
 *               - messageContent
 *     responses:
 *       201:
 *         description: Agent message sent and stored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       202:
 *         description: User message received and stored. AI response will be streamed via WebSocket.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Message received and stored. Listen on WebSocket for the agent's response.
 *                 storedMessage:
 *                   $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Bad request (e.g., missing messageContent).
 *       404:
 *         description: Session not found.
 *       500:
 *         description: Failed to send message.
 */
chatApiRoutes.post('/sessions/:sessionId/messages', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { messageContent, sender = 'user' } = req.body as { messageContent?: string, sender?: 'user' | 'agent' };

  if (!messageContent) {
    res.status(400).json({ error: 'messageContent is required' });
    return;
  }
  if (sender !== 'user' && sender !== 'agent') {
    res.status(400).json({ error: "Invalid sender type. Must be 'user' or 'agent'." });
    return;
  }

  try {
    console.log(`[Server] Message received via HTTP for session ${sessionId} by ${sender}`);
    const result = await chatService.sendMessage(sessionId, messageContent, sender);

    if (sender === 'user') {
      // User message was stored, LLM interaction initiated (stream via WebSocket)
      // Find the message that was just stored to return it.
      const currentSession = await chatService.getChatHistory(sessionId); // Re-fetch or get from ChatService
      const storedUserMessage = currentSession.find(
        (m) => m.content === messageContent && m.sender === 'user' && m.sessionId === sessionId
      ); // This might not be robust if messages are identical.
         // A better way would be if sendMessage returned the stored user message ID/object.
         // For now, this is an attempt.
      console.log(`[Server] User message stored for session ${sessionId}. Streaming reply over WebSocket.`);
      res.status(202).json({ 
        message: "Message received and stored. Listen on WebSocket for the agent's response.",
        storedMessage: storedUserMessage || { note: "User message stored, details not immediately retrievable by this HTTP response."}
      });
    } else {
      // Agent message was stored (result is ChatMessage)
      console.log(`[Server] Agent message stored for session ${sessionId} via HTTP.`);
      res.status(201).json(result as ChatMessage);
    }
  } catch (error: any) {
    console.error(`[Server] Error sending message to session ${sessionId} via HTTP:`, error.message);
    if (error.message.includes('Session not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

/**
 * @swagger
 * /api/chat/sessions/{sessionId}/messages:
 *   get:
 *     summary: Get the chat history for a session
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat session.
 *     responses:
 *       200:
 *         description: Chat history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatMessage'
 *       404:
 *         description: Session not found.
 *       500:
 *         description: Failed to retrieve chat history.
 */
chatApiRoutes.get('/sessions/:sessionId/messages', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const history = await chatService.getChatHistory(sessionId);
    console.log(`[Server] History retrieved for session ${sessionId} via HTTP: ${history.length} messages`);
    res.status(200).json(history);
  } catch (error: any) {
    console.error(`[Server] Error getting chat history for session ${sessionId} via HTTP:`, error.message);
    if (error.message.includes('Session not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
  }
});

app.use('/api/chat', chatApiRoutes);

// --- WebSocket Server Setup ---
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });

console.log('[Server] WebSocket server configured to listen on /ws/chat');

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const connectionId = uuidv4(); // Unique ID for this specific WebSocket connection
  console.log(`[WebSocket] Client connected: ${connectionId} (IP: ${req.socket.remoteAddress})`);

  ws.on('message', async (message: Buffer | string) => {
    const messageString = message.toString();
    console.log(`[WebSocket] Received message from ${connectionId}: ${messageString}`);
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(messageString);
    } catch (error) {
      console.error(`[WebSocket] Failed to parse message from ${connectionId} as JSON:`, messageString, error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON message format.' }));
      return;
    }

    const { type, sessionId, content, sessionToken } = parsedMessage; // sessionToken for future auth

    if (type === 'chat_message' && sessionId && content) {
      try {
        // Store user message and get stream for agent's response
        const streamResult = await chatService.sendMessage(sessionId, content, 'user');

        if (isAsyncIterable<string>(streamResult)) {
          console.log(`[WebSocket] Streaming LLM response for session ${sessionId} to client ${connectionId}`);
          // streamResult is now correctly typed as AsyncIterable<string>
          for await (const chunk of streamResult) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'llm_chunk', sessionId, content_chunk: chunk }));
            } else {
              console.warn(`[WebSocket] Client ${connectionId} disconnected during stream for session ${sessionId}. Aborting.`);
              break;
            }
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'llm_stream_end', sessionId }));
            console.log(`[WebSocket] Finished streaming LLM response for session ${sessionId} to client ${connectionId}`);
          }
        } else {
          // This case implies streamResult is ChatMessage.
          // This should not happen when sender is 'user' as per ChatService logic.
          const actualMessage = streamResult as ChatMessage; // Cast for logging purposes
          console.error(`[WebSocket] Expected a stream from ChatService for user message, but received a ChatMessage. Session: ${sessionId}. Message content: "${actualMessage.content}"`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', sessionId, error: 'Internal error: Expected a stream for agent response but received a single message object.' }));
          }
        }
      } catch (error: any) {
        console.error(`[WebSocket] Error processing chat_message for session ${sessionId} from ${connectionId}:`, error.message, error.stack);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', sessionId, error: `Failed to process message: ${error.message}` }));
        }
      }
    } else if (type === 'session_init' && sessionId) {
        // Example: Client signals it's ready for a session or wants to confirm session
        console.log(`[WebSocket] Client ${connectionId} initialized/confirmed session ${sessionId}`);
        // Optionally, send back session details or a confirmation
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'session_confirmed', sessionId }));
        }
    }
    else {
      console.warn(`[WebSocket] Received unhandled message type or malformed message from ${connectionId}:`, parsedMessage);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', error: 'Unhandled message type or malformed message.' }));
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] Client disconnected: ${connectionId} (Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'})`);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Error on connection ${connectionId}:`, error);
  });

  // Send a welcome message or connection confirmation
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'connection_ack', connectionId, message: 'Successfully connected to Chat WebSocket.' }));
  }
});


// --- Basic Error Handling for undefined HTTP routes ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'HTTP Route Not Found' });
});

// --- Server Initialization ---
const PORT = process.env.CHAT_SERVICE_PORT || 3002;

httpServer.listen(PORT, () => {
  console.log(`[Server] Chat service (HTTP and WebSocket) running on port ${PORT}`);
  console.log(`[Server] HTTP API available at http://localhost:${PORT}/api/chat`);
  console.log(`[Server] WebSocket available at ws://localhost:${PORT}/ws/chat`);
});

// --- Swagger Component Definitions (for reference) ---
/**
 * @swagger
 * components:
 *   schemas:
 *     ChatSession:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *           description: Unique identifier for the chat session.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the session was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the session was last updated.
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChatMessage'
 *           description: List of messages in the session.
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the message.
 *         sessionId:
 *           type: string
 *           description: The ID of the session this message belongs to.
 *         sender:
 *           type: string
 *           enum: [user, agent, system]
 *           description: Who sent the message.
 *         content:
 *           type: string
 *           description: The text content of the message.
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the message was sent.
 */