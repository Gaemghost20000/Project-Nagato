import express, { Request, Response, Express } from 'express';
import dotenv from 'dotenv';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { Stream } from 'stream';

// Load environment variables from .env file
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

interface ChatCompletionRequest {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
  // Add other OpenAI compatible parameters as needed
  max_tokens?: number;
  temperature?: number;
}

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const {
    model: requestModel,
    messages,
    stream = false,
    ...otherParams
  }: ChatCompletionRequest = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required field "messages"' });
  }

  const llmProvider = process.env.LLM_PROVIDER?.toLowerCase() || 'openrouter';
  const defaultModel = process.env.DEFAULT_MODEL_NAME;

  let apiKey: string | undefined;
  let apiBaseUrl: string | undefined;
  let effectiveModel = requestModel || defaultModel;

  if (llmProvider === 'openrouter') {
    apiKey = process.env.OPENROUTER_API_KEY;
    apiBaseUrl = process.env.OPENROUTER_API_BASE;
    if (!apiKey || !apiBaseUrl) {
      console.error('OpenRouter API key or base URL is not configured.');
      return res.status(500).json({ error: 'LLM provider (OpenRouter) not configured correctly.' });
    }
  } else if (llmProvider === 'litellm') {
    apiKey = process.env.LITELLM_API_KEY; // LiteLLM might not always require a key if it's self-hosted and configured that way
    apiBaseUrl = process.env.LITELLM_API_BASE;
    if (!apiBaseUrl) { // API key might be optional for LiteLLM
      console.error('LiteLLM API base URL is not configured.');
      return res.status(500).json({ error: 'LLM provider (LiteLLM) not configured correctly.' });
    }
  } else {
    console.error(`Unsupported LLM_PROVIDER: ${llmProvider}`);
    return res.status(500).json({ error: `Unsupported LLM provider: ${llmProvider}` });
  }

  if (!effectiveModel) {
    console.error('No model specified in request or as default in environment variables.');
    return res.status(400).json({ error: 'Missing model information.' });
  }

  const requestPayload = {
    model: effectiveModel,
    messages,
    stream,
    ...otherParams,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  // For OpenRouter, add HTTP Referer and X-Title headers as recommended
  if (llmProvider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_REFERRER || 'http://localhost'; // Replace with your actual site URL
    headers['X-Title'] = process.env.OPENROUTER_X_TITLE || 'AI Dev Agent'; // Replace with your app name
  }

  const axiosConfig: AxiosRequestConfig = {
    method: 'POST',
    url: `${apiBaseUrl}/chat/completions`,
    data: requestPayload,
    headers,
    responseType: stream ? 'stream' : 'json',
  };

  console.log(`Forwarding request to ${llmProvider} at ${axiosConfig.url} for model ${effectiveModel}, stream: ${stream}`);

  try {
    const llmResponse = await axios(axiosConfig);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      (llmResponse.data as Stream).pipe(res);
    } else {
      res.json(llmResponse.data);
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Error calling LLM provider:');
    if (axiosError.response) {
      console.error('Status:', axiosError.response.status);
      console.error('Data:', axiosError.response.data);
      res.status(axiosError.response.status).json(axiosError.response.data);
    } else if (axiosError.request) {
      console.error('Request Error:', axiosError.request);
      res.status(500).json({ error: 'No response received from LLM provider.' });
    } else {
      console.error('Error message:', axiosError.message);
      res.status(500).json({ error: 'Failed to make request to LLM provider.' });
    }
  }
});

app.get('/', (req: Request, res: Response) => {
  res.send('LLM Gateway is running.');
});

app.listen(PORT, () => {
  console.log(`LLM Gateway service HTTP server started on port ${PORT}`);
  console.log(`Configured LLM Provider: ${process.env.LLM_PROVIDER || 'openrouter (default)'}`);
  console.log(`Default Model: ${process.env.DEFAULT_MODEL_NAME || 'Not set'}`);
});

export default app;