"use client";

import { useEffect, useState, useRef } from 'react';
import {
  LLMChunkMessage,
  LLMStreamEndMessage,
  ToolResponseMessage,
  // ClientChatMessage, // This is for messages sent TO backend
} from '@ai-dev-agent/shared';

// Define types for messages displayed in the UI
interface UserDisplayMessage {
  id: string;
  type: 'user_message';
  sender: 'user';
  content: string;
  sessionId?: string;
  timestamp: string;
}

interface AgentDisplayMessage {
  id: string;
  type: 'agent_message';
  sender: 'agent';
  content: string;
  sessionId?: string;
  timestamp: string;
  isStreaming?: boolean; // To manage the "Agent is typing..." visual cue
}

// Union type for all messages that can be in the messages state
interface DisplayableToolResponseMessage extends ToolResponseMessage {
  id: string; // For React key and consistent handling
  sender: 'agent'; // Tool responses are considered from the agent
}
type DisplayableMessage = UserDisplayMessage | AgentDisplayMessage | DisplayableToolResponseMessage;


const CHAT_SERVICE_WS_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_WS_URL || 'ws://localhost:3002/ws/chat';
const CHAT_SERVICE_API_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_API_URL || 'http://localhost:3002/api/chat';


export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<DisplayableMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // 1. Establish WebSocket Connection and Fetch Session ID
  useEffect(() => {
    const fetchSessionIdAndConnect = async () => {
      try {
        console.log(`Fetching session ID from: ${CHAT_SERVICE_API_URL}/sessions`);
        const response = await fetch(`${CHAT_SERVICE_API_URL}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch session ID: ${response.statusText}`);
        }
        const data = await response.json();
        const newSessionId = data.sessionId;
        console.log('Session ID received:', newSessionId);
        setSessionId(newSessionId);

        console.log(`Attempting to connect to WebSocket: ${CHAT_SERVICE_WS_URL}`);
        const socket = new WebSocket(CHAT_SERVICE_WS_URL);
        setWs(socket);

        socket.onopen = () => {
          console.log('WebSocket connection established.');
          // Optionally send an initial message to associate session, if backend requires
          // socket.send(JSON.stringify({ type: "session_init", sessionId: newSessionId }));
        };

        socket.onmessage = (event) => {
          console.log('WebSocket message received:', event.data);
          try {
            const messageData = JSON.parse(event.data as string);

            if (messageData.sessionId && messageData.sessionId !== newSessionId) {
              console.warn("Received message for a different session ID, ignoring.");
              return;
            }

            setMessages((prevMessages) => {
              let updatedMessages = [...prevMessages];
              const lastMessage = updatedMessages[updatedMessages.length - 1] as AgentDisplayMessage | undefined;

              if (messageData.type === 'llm_chunk') {
                const chunk = messageData as LLMChunkMessage;
                setIsStreaming(true);
                if (lastMessage && lastMessage.type === 'agent_message' && lastMessage.sender === 'agent' && lastMessage.sessionId === chunk.sessionId && lastMessage.isStreaming) {
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: lastMessage.content + chunk.content_chunk,
                    timestamp: chunk.timestamp, // Update timestamp to the latest chunk
                  };
                } else {
                  // Start a new agent message
                  updatedMessages.push({
                    id: chunk.messageId || `agent-${Date.now()}`, // Use messageId from chunk if available
                    type: 'agent_message',
                    sender: 'agent',
                    content: chunk.content_chunk,
                    sessionId: chunk.sessionId,
                    timestamp: chunk.timestamp,
                    isStreaming: true,
                  });
                }
              } else if (messageData.type === 'llm_stream_end') {
                const streamEnd = messageData as LLMStreamEndMessage;
                setIsStreaming(false);
                if (lastMessage && lastMessage.type === 'agent_message' && lastMessage.sender === 'agent' && lastMessage.sessionId === streamEnd.sessionId && (lastMessage.id === streamEnd.messageId || !streamEnd.messageId)) {
                   updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    isStreaming: false,
                    timestamp: streamEnd.timestamp, // Update timestamp to the end event
                  };
                } else {
                    console.warn("LLM stream end received but couldn't find matching active stream message.", streamEnd);
                }
              } else if (messageData.type === 'tool_response') {
                const toolMsg = messageData as ToolResponseMessage; // Original message from WebSocket
                const displayableToolMsg: DisplayableToolResponseMessage = {
                  ...toolMsg,
                  id: toolMsg.toolCallId || `tool-${Date.now()}`,
                  sender: 'agent', // Explicitly set sender
                };
                updatedMessages.push(displayableToolMsg);
                setIsStreaming(false); // Assuming tool responses are not part of an active LLM stream
              } else if (messageData.type === 'error') {
                console.error('Error message from server:', messageData.message);
                updatedMessages.push({
                  id: `error-${Date.now()}`,
                  type: 'agent_message', // Display as an agent message
                  sender: 'agent',
                  content: `Error: ${messageData.message || 'Unknown error from server.'}`,
                  sessionId: newSessionId, // or messageData.sessionId if available
                  timestamp: new Date().toISOString(),
                  isStreaming: false,
                });
                setIsStreaming(false);
              } else {
                console.warn('Received unknown message type:', messageData.type, messageData);
              }
              return updatedMessages;
            });
          } catch (error) {
            console.error('Failed to parse WebSocket message or update state:', error);
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                id: `error-parse-${Date.now()}`,
                type: 'agent_message',
                sender: 'agent',
                content: 'Error processing message from server.',
                sessionId: newSessionId,
                timestamp: new Date().toISOString(),
              },
            ]);
            setIsStreaming(false);
          }
        };

        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              id: `error-ws-${Date.now()}`,
              type: 'agent_message',
              sender: 'agent',
              content: 'WebSocket connection error.',
              sessionId: newSessionId, // or null if session ID is not yet available
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsStreaming(false);
        };

        socket.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          setWs(null);
          // Optionally, you might want to attempt to reconnect here or inform the user.
        };

      } catch (error) {
        console.error('Failed to fetch session ID or connect to WebSocket:', error);
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: `error-init-${Date.now()}`,
            type: 'agent_message',
            sender: 'agent',
            content: `Failed to initialize chat: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    };

    fetchSessionIdAndConnect();

    return () => {
      if (ws) {
        console.log('Closing WebSocket connection.');
        ws.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // 3. Sending Messages & Handling Mock Commands
  const handleMockCommand = (command: string) => {
    const now = new Date().toISOString();
    const currentSessionId = sessionId || "mockSession";

    if (command === '/mock stream') {
      const streamMessages: DisplayableMessage[] = [];
      const agentMessageId = `agent-mock-stream-${Date.now()}`;
      // Simulate receiving chunks
      const chunks = ["This ", "is ", "a ", "mocked ", "LLM ", "stream. "];
      chunks.forEach((chunkContent, index) => {
        const chunkMsg: LLMChunkMessage = {
          type: 'llm_chunk',
          sessionId: currentSessionId,
          messageId: agentMessageId,
          content_chunk: chunkContent,
          timestamp: new Date(Date.now() + index * 100).toISOString(), // Stagger timestamps
        };
        // Simulate how onmessage would process this
        setMessages(prev => {
          let updated = [...prev];
          const last = updated[updated.length -1] as AgentDisplayMessage | undefined;
          if (last && last.type === 'agent_message' && last.id === agentMessageId && last.isStreaming) {
            updated[updated.length -1] = {...last, content: last.content + chunkMsg.content_chunk, timestamp: chunkMsg.timestamp};
          } else {
            updated.push({
              id: agentMessageId,
              type: 'agent_message',
              sender: 'agent',
              content: chunkMsg.content_chunk,
              sessionId: chunkMsg.sessionId,
              timestamp: chunkMsg.timestamp,
              isStreaming: true,
            });
          }
          return updated;
        });
      });

      // Simulate stream end
      const endMsg: LLMStreamEndMessage = {
        type: 'llm_stream_end',
        sessionId: currentSessionId,
        messageId: agentMessageId,
        timestamp: new Date(Date.now() + chunks.length * 100).toISOString(),
      };
      setMessages(prev => {
        let updated = [...prev];
        const last = updated[updated.length -1] as AgentDisplayMessage | undefined;
        if (last && last.type === 'agent_message' && last.id === agentMessageId) {
          updated[updated.length -1] = {...last, isStreaming: false, timestamp: endMsg.timestamp};
        }
        return updated;
      });
      setIsStreaming(false); // Ensure global streaming state is also reset

    } else if (command === '/mock tool_response_success') {
      const mockToolResponse: DisplayableToolResponseMessage = {
        id: `tool-${Date.now()}`,
        sender: 'agent',
        type: 'tool_response',
        sessionId: currentSessionId,
        timestamp: now,
        toolCallId: 'mockToolCallSuccess123',
        toolName: 'file_reader',
        response: {
          status: 'success',
          filePath: '/path/to/mock/file.txt',
          content: 'This is the mock content of the file read successfully.',
        } as any, // Cast for specific tool if needed, or keep generic
        isError: false,
      };
      setMessages((prevMessages) => [...prevMessages, mockToolResponse]);
    } else if (command === '/mock tool_response_error') {
      const mockToolErrorResponse: DisplayableToolResponseMessage = {
        id: `tool-${Date.now()}`,
        sender: 'agent',
        type: 'tool_response',
        sessionId: currentSessionId,
        timestamp: now,
        toolCallId: 'mockToolCallError456',
        toolName: 'web_scraper',
        response: {
          status: 'error',
          message: 'Failed to scrape URL: Network timeout. This is a mock error.',
        } as any, // Cast for specific tool
        isError: true,
      };
      setMessages((prevMessages) => [...prevMessages, mockToolErrorResponse]);
    }
    setInputValue(''); // Clear input after mock command
  };

  const handleSendMessage = () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) return;

    if (trimmedInput.startsWith('/mock')) {
      handleMockCommand(trimmedInput);
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
      const userMessage: UserDisplayMessage = {
        id: `user-${Date.now()}`,
        type: 'user_message',
        sender: 'user',
        content: trimmedInput,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
      };
      setMessages((prevMessages) => [...prevMessages, userMessage]);

      const messageToSend = { // This is ClientChatMessage structure
        type: 'chat_message',
        sessionId: sessionId,
        content: trimmedInput,
        timestamp: new Date().toISOString(),
      };
      console.log('Sending message to WebSocket:', JSON.stringify(messageToSend));
      ws.send(JSON.stringify(messageToSend));
      setInputValue('');
      setIsStreaming(true); // Expecting a stream in response
    } else {
      console.warn('Cannot send message. WebSocket not open, input empty, or no session ID.', {
        wsReadyState: ws?.readyState,
        inputValue: trimmedInput,
        sessionId,
      });
      const errorTimestamp = new Date().toISOString();
      if (!sessionId) {
        setMessages(prev => [...prev, {id: 'error-no-session', type: 'agent_message', sender: 'agent', content: 'Error: No session ID. Cannot send message.', timestamp: errorTimestamp}]);
      } else if (!ws || ws.readyState !== WebSocket.OPEN) {
         setMessages(prev => [...prev, {id: 'error-no-ws', type: 'agent_message', sender: 'agent', content: 'Error: WebSocket not connected. Cannot send message.', timestamp: errorTimestamp}]);
      }
    }
  };

  // Helper to render tool response content
  const renderToolResponseContent = (response: any, toolName: string) => {
    if (response.status === 'error' && 'message' in response) {
      return <p style={{ color: 'red' }}>Error: {response.message}</p>;
    }
    if (response.status === 'success') {
      // Customize based on toolName or response structure
      if (toolName === 'file_reader' && 'filePath' in response && 'content' in response) {
        return (
          <>
            <p><strong>File Path:</strong> {response.filePath}</p>
            <p><strong>Content:</strong></p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
              {response.content}
            </pre>
          </>
        );
      }
      // Generic fallback for other success responses
      return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>{JSON.stringify(response, null, 2)}</pre>;
    }
    return <p>Unknown tool response format.</p>;
  };


  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box', backgroundColor: '#f0f0f0' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '20px' }}>AI Dev Agent Chat</h1>
      <div style={{ flexGrow: 1, border: '1px solid #ccc', borderRadius: '8px', padding: '15px', overflowY: 'auto', backgroundColor: '#fff', marginBottom: '20px' }}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const baseStyle: React.CSSProperties = {
            marginBottom: '12px',
            padding: '10px 15px',
            borderRadius: '18px',
            maxWidth: '70%',
            wordWrap: 'break-word',
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            marginLeft: isUser ? 'auto' : '0',
            marginRight: !isUser ? 'auto' : '0',
            color: isUser ? 'white' : '#333',
          };

          if (msg.type === 'user_message' || msg.type === 'agent_message') {
            return (
              <div
                key={msg.id}
                style={{
                  ...baseStyle,
                  backgroundColor: isUser ? '#007bff' : '#e9ecef',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '3px', fontSize: '0.9em' }}>
                  {isUser ? 'You' : 'Agent'} (Session: {msg.sessionId?.substring(0, 8) || 'N/A'})
                  {msg.type === 'agent_message' && msg.isStreaming && " (typing...)"}
                </strong>
                {msg.content}
                 <div style={{ fontSize: '0.75em', color: isUser ? '#e0e0e0' : '#777', textAlign: 'right', marginTop: '5px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          } else if (msg.type === 'tool_response') {
            return (
              <div
                key={msg.id}
                style={{
                  ...baseStyle,
                  backgroundColor: msg.isError ? '#ffebee' : '#e6ffed', // Light red for error, light green for success
                  border: `1px solid ${msg.isError ? '#e57373' : '#81c784'}`,
                }}
              >
                <strong style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', color: msg.isError ? '#c62828' : '#2e7d32' }}>
                  Tool Response: {msg.toolName} ({msg.isError ? 'Error' : 'Success'})
                </strong>
                <div>Session: {msg.sessionId?.substring(0, 8) || 'N/A'} | Tool Call ID: {msg.toolCallId.substring(0,8)}...</div>
                {renderToolResponseContent(msg.response, msg.toolName)}
                <div style={{ fontSize: '0.75em', color: '#555', textAlign: 'right', marginTop: '5px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          }
          return null; // Should not happen if types are exhaustive
        })}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ display: 'flex', marginTop: 'auto' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isStreaming && handleSendMessage()}
          placeholder={isStreaming ? "Agent is responding..." : "Type your message..."}
          style={{ flexGrow: 1, padding: '12px', border: '1px solid #ccc', borderRadius: '20px 0 0 20px', outline: 'none', fontSize: '1em' }}
          disabled={!ws || ws.readyState !== WebSocket.OPEN || isStreaming || !sessionId}
        />
        <button
          onClick={handleSendMessage}
          style={{ padding: '12px 20px', border: 'none', backgroundColor: '#007bff', color: 'white', borderRadius: '0 20px 20px 0', cursor: 'pointer', fontSize: '1em' }}
          disabled={!ws || ws.readyState !== WebSocket.OPEN || inputValue.trim() === '' || isStreaming || !sessionId}
        >
          Send
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.8em', color: '#777' }}>
        Session ID: {sessionId || 'Connecting...'} | WebSocket: {ws?.readyState === WebSocket.OPEN ? 'Connected' : ws?.readyState === WebSocket.CONNECTING ? 'Connecting' : 'Disconnected'}
        {isStreaming && " (Agent is typing...)"}
      </div>
    </main>
  );
}