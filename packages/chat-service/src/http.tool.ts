import { IAgentTool, ToolOutput } from '@ai-dev-agent/shared';

/**
 * Configuration for an HTTP-based tool.
 */
export interface HttpToolConfig {
  name: string;
  description: string;
  baseUrl: string; // Base URL of the external tool service
  // Optional: specific endpoint path if not just baseUrl, e.g., '/execute'
  // endpoint?: string; 
}

/**
 * An implementation of IAgentTool that communicates with an external tool service
 * via HTTP.
 */
export class HttpTool implements IAgentTool {
  readonly name: string;
  readonly description: string;
  private readonly baseUrl: string;
  // private readonly endpoint: string;

  constructor(config: HttpToolConfig) {
    this.name = config.name;
    this.description = config.description;
    this.baseUrl = config.baseUrl;
    // this.endpoint = config.endpoint || ''; // Default to no specific sub-path
  }

  /**
   * Executes the external tool by making an HTTP POST request.
   * @param args The arguments for the tool.
   * @param toolCallId The unique ID for this tool call.
   * @param sessionId The session ID initiating the call.
   * @returns A Promise resolving to a ToolOutput.
   */
  async execute(
    args: any,
    toolCallId: string,
    sessionId: string,
  ): Promise<ToolOutput> {
    const requestUrl = this.baseUrl; // `${this.baseUrl}${this.endpoint}`;
    const requestBody = {
      arguments: args,
      toolCallId,
      sessionId,
    };

    console.log(
      `[HttpTool:${this.name}] Executing tool. Request ID: ${toolCallId}, Session ID: ${sessionId}, URL: ${requestUrl}, Args: ${JSON.stringify(args)}`,
    );

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[HttpTool:${this.name}] Error response from tool service. Status: ${response.status}, Body: ${errorText}, Request ID: ${toolCallId}`,
        );
        return {
          response: `Error calling tool ${this.name}: ${response.status} ${response.statusText}. ${errorText}`,
          isError: true,
        };
      }

      // Assuming the external tool service returns a JSON compatible with ToolOutput
      // or at least { response: any, isError?: boolean }
      const toolServiceResponse: ToolOutput = await response.json();
      
      console.log(
        `[HttpTool:${this.name}] Successfully executed tool. Request ID: ${toolCallId}, Response: ${JSON.stringify(toolServiceResponse)}`,
      );
      return toolServiceResponse;

    } catch (error: any) {
      console.error(
        `[HttpTool:${this.name}] Network or unexpected error calling tool service. Request ID: ${toolCallId}, Error: ${error.message}`,
        error,
      );
      return {
        response: `Failed to call tool ${this.name} due to a network or unexpected error: ${error.message}`,
        isError: true,
      };
    }
  }
}