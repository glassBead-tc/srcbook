/**
 * MCP Client Manager
 *
 * This module manages connections to multiple MCP servers based on configuration.
 * It focuses on tool discovery and execution, providing a unified interface for
 * accessing tools from multiple MCP servers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { posthog } from '../posthog-client.mjs';

// Define types for MCP configuration
export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

export const MCPConfigSchema = z.object({
  mcpServers: z.record(MCPServerConfigSchema),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// Define types for MCP tools
export interface MCPTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: any;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/**
 * MCP Client Manager class
 *
 * Manages connections to multiple MCP servers and provides a unified interface
 * for discovering and executing tools.
 */
export class MCPClientManager {
  private connections: Map<string, Client> = new Map();
  private config: MCPConfig | null = null;
  private configPath: string;
  private tools: MCPTool[] = [];
  private _isInitialized = false;

  /**
   * Check if the client manager is initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Create a new MCP Client Manager
   * @param configPath Path to the MCP configuration file
   */
  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Initialize the MCP Client Manager
   * Loads the configuration and connects to all configured servers
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      // Load and parse the configuration
      await this.loadConfig();

      if (!this.config) {
        console.warn('No MCP configuration found. MCP functionality will be disabled.');
        return;
      }

      // Connect to all configured servers
      const serverIds = Object.keys(this.config.mcpServers);
      console.log(`Connecting to ${serverIds.length} MCP servers...`);

      for (const serverId of serverIds) {
        try {
          await this.connectToServer(serverId);
        } catch (error) {
          console.error(`Failed to connect to MCP server ${serverId}:`, error);
        }
      }

      // Discover tools from all connected servers
      await this.discoverAllTools();

      this._isInitialized = true;
      console.log(
        `MCP Client Manager initialized with ${this.connections.size} servers and ${this.tools.length} tools.`,
      );

      posthog.capture({
        event: 'mcp_client_manager_initialized',
        properties: {
          serverCount: this.connections.size,
          toolCount: this.tools.length,
        },
      });
    } catch (error) {
      console.error('Failed to initialize MCP Client Manager:', error);
      throw error;
    }
  }

  /**
   * Load the MCP configuration from the specified file
   */
  private async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);

      // Validate the configuration
      const result = MCPConfigSchema.safeParse(parsedConfig);

      if (!result.success) {
        console.error('Invalid MCP configuration:', result.error);
        return;
      }

      this.config = result.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`MCP configuration file not found at ${this.configPath}`);
        return;
      }

      console.error('Error loading MCP configuration:', error);
      throw error;
    }
  }

  /**
   * Connect to a specific MCP server
   * @param serverId The ID of the server to connect to
   */
  private async connectToServer(serverId: string): Promise<Client | null> {
    if (!this.config) {
      return null;
    }

    const serverConfig = this.config.mcpServers[serverId];
    if (!serverConfig) {
      console.warn(`No configuration found for MCP server ${serverId}`);
      return null;
    }

    try {
      // Create a new client
      const client = new Client(
        { name: 'srcbook-mcp-client', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );

      // Set up environment variables for the server process
      // Convert env to Record<string, string> by filtering out undefined values
      const envVars: Record<string, string> = {};
      if (serverConfig.env) {
        Object.entries(serverConfig.env).forEach(([key, value]) => {
          if (value !== undefined) {
            envVars[key] = value;
          }
        });
      }

      // Add process.env values, filtering out undefined
      if (process.env) {
        Object.entries(process.env).forEach(([key, value]) => {
          if (value !== undefined) {
            envVars[key] = value;
          }
        });
      }

      // Create a transport
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: envVars,
      });

      // Connect to the server
      console.log(`Connecting to MCP server ${serverId}...`);
      await client.connect(transport);
      console.log(`Connected to MCP server ${serverId}`);

      // Store the connection
      this.connections.set(serverId, client);

      posthog.capture({
        event: 'mcp_server_connected',
        properties: { serverId },
      });

      return client;
    } catch (error) {
      console.error(`Error connecting to MCP server ${serverId}:`, error);
      return null;
    }
  }

  /**
   * Discover tools from all connected servers
   */
  private async discoverAllTools(): Promise<void> {
    this.tools = [];

    for (const [serverId, client] of this.connections.entries()) {
      try {
        // @ts-ignore - TypeScript doesn't recognize the listTools method
        const toolsResult = await client.listTools();

        // Map the tools to our internal format
        const serverTools = toolsResult.tools.map((tool) => {
          // Create a properly typed MCPTool object
          const mcpTool: MCPTool = {
            serverId,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            // Handle annotations with proper typing
            annotations: tool.annotations as MCPTool['annotations'],
          };
          return mcpTool;
        });

        this.tools.push(...serverTools);
        console.log(`Discovered ${serverTools.length} tools from server ${serverId}`);
      } catch (error) {
        console.error(`Error discovering tools from server ${serverId}:`, error);
      }
    }
  }

  /**
   * Get all available tools from all connected servers
   * @returns Array of available tools
   */
  async getTools(): Promise<MCPTool[]> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    return this.tools;
  }

  /**
   * Call a tool on a specific server
   * @param serverId The ID of the server to call the tool on
   * @param toolName The name of the tool to call
   * @param args The arguments to pass to the tool
   * @returns The result of the tool call
   */
  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    const client = this.connections.get(serverId);
    if (!client) {
      throw new Error(`No connection to MCP server ${serverId}`);
    }

    // Find the tool definition
    const tool = this.tools.find((t) => t.serverId === serverId && t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverId}`);
    }

    try {
      // Validate the arguments against the tool's input schema
      const validatedArgs = this.validateToolArgs(tool, args);

      console.log(
        `Calling tool ${toolName} on server ${serverId} with validated args:`,
        validatedArgs,
      );

      posthog.capture({
        event: 'mcp_tool_called',
        properties: { serverId, toolName },
      });

      // @ts-ignore - TypeScript doesn't recognize the callTool method signature correctly
      const result = await client.callTool(toolName, validatedArgs);

      // Safely handle the result
      if (result && typeof result === 'object' && 'isError' in result && result.isError) {
        // Safely access content if it exists
        const errorMessage =
          result.content &&
          Array.isArray(result.content) &&
          result.content.length > 0 &&
          result.content[0] &&
          typeof result.content[0] === 'object' &&
          'text' in result.content[0]
            ? result.content[0].text
            : 'Unknown error';

        console.error(`Tool ${toolName} returned an error:`, errorMessage);
        throw new Error(`Tool error: ${errorMessage}`);
      }

      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolName} on server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Find a tool by name across all servers
   * @param toolName The name of the tool to find
   * @returns The tool if found, null otherwise
   */
  /**
   * Create a Zod schema from a JSON Schema object
   * @param schema JSON Schema object
   * @returns Zod schema
   */
  private createZodSchema(schema: any): z.ZodTypeAny {
    // Handle null or undefined schema
    if (!schema) {
      return z.any();
    }

    const type = schema.type;

    // Handle different types
    if (type === 'string') {
      let stringSchema = z.string();

      // Add pattern validation if specified
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }

      // Add min/max length validation if specified
      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }

      // Handle enum values
      if (schema.enum && Array.isArray(schema.enum)) {
        return z.enum(schema.enum as [string, ...string[]]);
      }

      return stringSchema;
    } else if (type === 'number' || type === 'integer') {
      let numberSchema = type === 'integer' ? z.number().int() : z.number();

      // Add min/max validation if specified
      if (schema.minimum !== undefined) {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        numberSchema = numberSchema.max(schema.maximum);
      }

      return numberSchema;
    } else if (type === 'boolean') {
      return z.boolean();
    } else if (type === 'null') {
      return z.null();
    } else if (type === 'array') {
      const items = schema.items || {};
      return z.array(this.createZodSchema(items));
    } else if (type === 'object') {
      const properties = schema.properties || {};
      const shape: Record<string, z.ZodTypeAny> = {};

      // Create schemas for all properties
      for (const [key, value] of Object.entries(properties)) {
        shape[key] = this.createZodSchema(value as any);
      }

      let objectSchema = z.object(shape);

      // Handle required properties
      if (schema.required && Array.isArray(schema.required)) {
        const requiredShape: Record<string, z.ZodTypeAny> = {};

        for (const key of Object.keys(shape)) {
          const isRequired = schema.required.includes(key);
          const zodType = shape[key];
          if (zodType) {
            requiredShape[key] = isRequired ? zodType : zodType.optional();
          }
        }

        objectSchema = z.object(requiredShape);
      } else {
        // If no required properties specified, make all properties optional
        const optionalShape: Record<string, z.ZodTypeAny> = {};

        for (const [key, value] of Object.entries(shape)) {
          if (value) {
            optionalShape[key] = value.optional();
          }
        }

        objectSchema = z.object(optionalShape);
      }

      return objectSchema;
    }

    // Default to any for unsupported types
    return z.any();
  }

  /**
   * Validate tool arguments against the tool's input schema
   * @param tool The tool to validate arguments for
   * @param args The arguments to validate
   * @returns Validated arguments
   */
  private validateToolArgs(tool: MCPTool, args: any): any {
    try {
      // Create a Zod schema from the tool's input schema
      const schema = this.createZodSchema(tool.inputSchema);

      // Validate the arguments against the schema
      return schema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format the validation errors
        const formattedErrors = error.errors
          .map((err) => {
            return `${err.path.join('.')}: ${err.message}`;
          })
          .join(', ');

        throw new Error(`Invalid arguments for tool ${tool.name}: ${formattedErrors}`);
      }

      throw error;
    }
  }

  findTool(toolName: string): MCPTool | null {
    return this.tools.find((tool) => tool.name === toolName) || null;
  }

  /**
   * Close all connections to MCP servers
   */
  async close(): Promise<void> {
    for (const [serverId, client] of this.connections.entries()) {
      try {
        await client.close();
        console.log(`Closed connection to MCP server ${serverId}`);
      } catch (error) {
        console.error(`Error closing connection to MCP server ${serverId}:`, error);
      }
    }

    this.connections.clear();
    this._isInitialized = false;
  }
}

// Create a singleton instance of the MCP Client Manager
let clientManagerInstance: MCPClientManager | null = null;

/**
 * Get the singleton instance of the MCP Client Manager
 * @param configPath Optional path to the MCP configuration file
 * @returns The MCP Client Manager instance
 */
export function getMCPClientManager(configPath?: string): MCPClientManager {
  if (!clientManagerInstance) {
    // Use a relative path from the current file to the config file
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const defaultConfigPath = path.resolve(currentDir, '../srcbook_mcp_config.json');
    console.log(`Using MCP config path: ${defaultConfigPath}`);
    clientManagerInstance = new MCPClientManager(configPath || defaultConfigPath);
  }

  return clientManagerInstance;
}
