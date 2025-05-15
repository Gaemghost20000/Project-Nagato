import { IAgentTool } from '@ai-dev-agent/shared';
import { HttpTool, HttpToolConfig } from './http.tool';

/**
 * Manages the registration and retrieval of available agent tools.
 * Tools are typically loaded from environment variable configurations.
 */
export class ToolRegistry {
  private registeredTools: Map<string, IAgentTool> = new Map();

  constructor() {
    this.loadAndRegisterToolsFromEnv();
  }

  /**
   * Registers a tool instance.
   * @param tool The IAgentTool instance to register.
   */
  public registerTool(tool: IAgentTool): void {
    if (this.registeredTools.has(tool.name)) {
      console.warn(
        `[ToolRegistry] Tool with name "${tool.name}" is already registered. Overwriting.`,
      );
    }
    this.registeredTools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  /**
   * Retrieves a registered tool by its name.
   * @param toolName The name of the tool to retrieve.
   * @returns The IAgentTool instance if found, otherwise undefined.
   */
  public getTool(toolName: string): IAgentTool | undefined {
    return this.registeredTools.get(toolName);
  }

  /**
   * Scans environment variables for tool configurations and registers them.
   * Expected format for environment variables:
   * `TOOL_CONFIG_<TOOL_ID>=<name>,<description>,<baseUrl>`
   * Example: `TOOL_CONFIG_FILE_MANAGER=file_manager,Manages files,http://localhost:3003/api/file`
   * Example: `TOOL_CONFIG_WEB_SCRAPER=web_scraper,Scrapes web pages,http://localhost:3004/scrape`
   *
   * Alternatively, a simpler scheme with dedicated variables per tool:
   * `TOOL_<NAME>_URL=http://localhost:PORT/path`
   * `TOOL_<NAME>_DESC="Description of the tool"`
   * For this implementation, we'll use the `TOOL_CONFIG_` prefix approach for conciseness.
   */
  private loadAndRegisterToolsFromEnv(): void {
    console.log('[ToolRegistry] Loading tools from environment variables...');
    let count = 0;
    for (const envVar in process.env) {
      if (envVar.startsWith('TOOL_CONFIG_')) {
        const configString = process.env[envVar];
        if (configString) {
          try {
            // Split by the first two commas only, description can contain commas
            const parts = configString.split(/,(.+)/);
            if (parts.length < 2) {
              console.warn(
                `[ToolRegistry] Invalid format for ${envVar}: "${configString}". Expected at least name,description_and_url. Skipping.`,
              );
              continue;
            }
            const name = parts[0].trim();
            const remaining = parts[1];
            
            const urlMatch = remaining.match(/(.*),\s*(https?:\/\/[^\s,]+)$/);

            if (!name || !urlMatch || urlMatch.length < 3) {
               console.warn(
                `[ToolRegistry] Invalid format for ${envVar}: "${configString}". Could not parse name, description, and URL. Expected format: <name>,<description>,<baseUrl>. Skipping.`,
              );
              continue;
            }
            
            const description = urlMatch[1].trim();
            const baseUrl = urlMatch[2].trim();


            if (!name || !description || !baseUrl) {
              console.warn(
                `[ToolRegistry] Invalid format for ${envVar}: "${configString}". Expected <name>,<description>,<baseUrl>. Skipping.`,
              );
              continue;
            }

            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
              console.warn(
                `[ToolRegistry] Invalid baseUrl for tool "${name}" in ${envVar}: "${baseUrl}". Must be a valid HTTP/S URL. Skipping.`,
              );
              continue;
            }

            const toolConfig: HttpToolConfig = {
              name,
              description,
              baseUrl,
            };
            const httpTool = new HttpTool(toolConfig);
            this.registerTool(httpTool);
            count++;
          } catch (error: any) {
            console.error(
              `[ToolRegistry] Error parsing tool configuration from ${envVar}="${configString}": ${error.message}`,
            );
          }
        }
      }
    }
    if (count > 0) {
      console.log(`[ToolRegistry] Successfully loaded and registered ${count} tools from environment variables.`);
    } else {
      console.log('[ToolRegistry] No tools found in environment variables with "TOOL_CONFIG_" prefix.');
    }
  }

  /**
   * Gets a list of all registered tool names.
   * @returns An array of tool names.
   */
  public listToolNames(): string[] {
    return Array.from(this.registeredTools.keys());
  }
}