"use client";

import { useEffect, useState, useRef } from 'react';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  sessionId?: string;
}

const CHAT_SERVICE_WS_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_WS_URL || 'ws://localhost:3002/ws/chat';
const CHAT_SERVICE_API_URL = process.env.NEXT_PUBLIC_CHAT_SERVICE_API_URL || 'http://localhost:3002/api/chat';


export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
              const lastMessage = updatedMessages[updatedMessages.length - 1];

              if (messageData.type === 'llm_chunk') {
                setIsStreaming(true);
                if (lastMessage && lastMessage.sender === 'agent' && lastMessage.sessionId === newSessionId) {
                  // Append to existing agent message
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: lastMessage.content + messageData.content_chunk,
                  };
                } else {
                  // Start a new agent message
                  updatedMessages.push({
                    id: `agent-${Date.now()}`,
                    sender: 'agent',
                    content: messageData.content_chunk,
                    sessionId: newSessionId,
                  });
                }
              } else if (messageData.type === 'llm_stream_end') {
                setIsStreaming(false);
                // The content is already accumulated, just mark streaming as ended.
                // If the last message wasn't from the agent or for this session, this might indicate an issue.
                if (!lastMessage || lastMessage.sender !== 'agent' || lastMessage.sessionId !== newSessionId) {
                    console.warn("LLM stream end received without a preceding agent message for this session.");
                }
              } else if (messageData.type === 'error') {
                console.error('Error message from server:', messageData.message);
                updatedMessages.push({
                  id: `error-${Date.now()}`,
                  sender: 'agent',
                  content: `Error: ${messageData.message || 'Unknown error from server.'}`,
                  sessionId: newSessionId,
                });
                setIsStreaming(false);
              } else {
                console.warn('Received unknown message type:', messageData.type);
              }
              return updatedMessages;
            });
          } catch (error) {
            console.error('Failed to parse WebSocket message or update state:', error);
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                id: `error-${Date.now()}`,
                sender: 'agent',
                content: 'Error processing message from server.',
                sessionId: newSessionId,
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
              id: `error-${Date.now()}`,
              sender: 'agent',
              content: 'WebSocket connection error.',
              sessionId: newSessionId, // or null if session ID is not yet available
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
            id: `error-${Date.now()}`,
            sender: 'agent',
            content: `Failed to initialize chat: ${error instanceof Error ? error.message : String(error)}`,
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

  // 3. Sending Messages
  const handleSendMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN && inputValue.trim() && sessionId) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: inputValue.trim(),
        sessionId: sessionId,
      };
      setMessages((prevMessages) => [...prevMessages, userMessage]);

      const messageToSend = {
        type: 'chat_message',
        sessionId: sessionId,
        content: inputValue.trim(),
      };
      console.log('Sending message to WebSocket:', JSON.stringify(messageToSend));
      ws.send(JSON.stringify(messageToSend));
      setInputValue('');
      setIsStreaming(true); // Expecting a stream in response
    } else {
      console.warn('Cannot send message. WebSocket not open, input empty, or no session ID.', {
        wsReadyState: ws?.readyState,
        inputValue: inputValue.trim(),
        sessionId,
      });
      if (!sessionId) {
        setMessages(prev => [...prev, {id: 'error-no-session', sender: 'agent', content: 'Error: No session ID. Cannot send message.'}]);
      } else if (!ws || ws.readyState !== WebSocket.OPEN) {
         setMessages(prev => [...prev, {id: 'error-no-ws', sender: 'agent', content: 'Error: WebSocket not connected. Cannot send message.'}]);
      }
    }
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box', backgroundColor: '#f0f0f0' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '20px' }}>AI Dev Agent Chat</h1>
      <div style={{ flexGrow: 1, border: '1px solid #ccc', borderRadius: '8px', padding: '15px', overflowY: 'auto', backgroundColor: '#fff', marginBottom: '20px' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: '12px',
              padding: '10px 15px',
              borderRadius: '18px',
              maxWidth: '70%',
              wordWrap: 'break-word',
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              marginLeft: msg.sender === 'user' ? 'auto' : '0',
              marginRight: msg.sender === 'agent' ? 'auto' : '0',
              backgroundColor: msg.sender === 'user' ? '#007bff' : '#e9ecef',
              color: msg.sender === 'user' ? 'white' : '#333',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '3px', fontSize: '0.9em' }}>
              {msg.sender === 'user' ? 'You' : 'Agent'} (Session: {msg.sessionId?.substring(0, 8) || 'N/A'})
            </strong>
            {msg.content}
          </div>
        ))}
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