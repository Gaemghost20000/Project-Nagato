# LLM Gateway Package (@ai-dev-agent/llm-gateway)

Acts as a unified gateway to various Large Language Model (LLM) providers like OpenAI, OpenRouter, and LiteLLM. It standardizes requests and responses, allowing other services in the monorepo to interact with LLMs through a consistent API.

## Features

-   **Provider Agnostic:** Supports multiple LLM providers. The active provider is determined by the `LLM_PROVIDER` environment variable.
-   **OpenAI-Compatible API:** Exposes an `/v1/chat/completions` endpoint that mimics the OpenAI API, simplifying integration for services familiar with this standard.
-   **Streaming Support:** Capable of streaming responses from LLM providers that support it.
-   **Centralized Configuration:** Manages API keys and provider-specific configurations.
-   **Improved Error Reporting:** Returns detailed and structured JSON error responses from upstream LLM providers, aiding in debugging.

## Supported LLM Providers

-   **OpenAI** (`LLM_PROVIDER="openai"`)
-   **OpenRouter** (`LLM_PROVIDER="openrouter"`)
-   **LiteLLM** (`LLM_PROVIDER="litellm"`)

## API Endpoints

-   **`POST /v1/chat/completions`**:
    -   Accepts requests in the OpenAI chat completions format.
    -   Proxies the request to the configured LLM provider.
    -   Streams responses if the `stream: true` option is included in the request and supported by the provider.
    -   Returns detailed JSON errors if issues occur with the upstream provider.

## Configuration

The service is configured via environment variables. See `.env.example` for a comprehensive list. Key variables include:

-   `PORT`: The port on which the service will listen. Defaults to `3002`.
-   `LLM_PROVIDER`: Specifies the LLM provider to use (e.g., `openai`, `openrouter`, `litellm`).
-   `OPENAI_API_KEY`: Your OpenAI API key (if using OpenAI).
-   `OPENROUTER_API_KEY`: Your OpenRouter API key (if using OpenRouter).
-   `OPENROUTER_API_BASE`: The base URL for the OpenRouter API. Defaults to `https://openrouter.ai/api/v1`.
-   `OPENROUTER_SITE_URL` (Optional): Your application's URL (e.g., `http://localhost:3000`). If provided, this will be sent as the `HTTP-Referer` to OpenRouter.
-   `OPENROUTER_APP_NAME` (Optional): Your application's name (e.g., `My AI Dev Agent`). If provided, this will be sent as the `X-Title` header to OpenRouter.
-   `LITELLM_API_KEY`: Your LiteLLM API key (if using LiteLLM and your LiteLLM setup requires a key).
-   `LITELLM_API_BASE`: The base URL for your LiteLLM server (if using LiteLLM).

**Security Note:** As per the [Sensitive Data rule](../../.kilocode/rules/sensitive-data.md), ensure that API keys and other sensitive credentials are managed securely (e.g., through environment variables or a secrets management system) and are not hardcoded or committed to version control. The `.env.example` file provides placeholders.

## Running the Service

From the monorepo root (`ai-dev-agent`):

-   **Development Mode (with hot-reloading):**
    ```bash
    pnpm --filter @ai-dev-agent/llm-gateway dev
    ```
-   **Production Mode:**
    ```bash
    pnpm --filter @ai-dev-agent/llm-gateway build
    pnpm --filter @ai-dev-agent/llm-gateway start
    ```

The service also implements a `/health` GET endpoint which returns `{"status": "UP"}` if the service is running.