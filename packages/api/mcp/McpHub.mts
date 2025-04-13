/**
 * McpHub - Core class for managing MCP server connections.
 * This class is responsible for managing connections to MCP servers,
 * tracking their state, and providing access to their tools and resources.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import {
  Client
} from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport
} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SSEClientTransport
} from '@modelcontextprotocol/sdk/client/sse.js';

import { ApplicationProvider } from './ApplicationProvider.mjs';
import {
  McpServer,
  McpServerConfig,
  McpServerSource,
  McpServerStatus,
  McpTool,
  McpToolCallResponse,
  McpResource,
  McpResourceResponse,
  McpResourceTemplate,
  McpSettings,
  McpConnection,
  McpStdioServerConfig,
  McpSseServerConfig,
  McpPrompt,
  McpPromptResponse
} from './types.mjs';

/**
 * Base configuration schema for common settings
 */
const BaseConfigSchema = z.object({
  disabled: z.boolean().optional(),
  timeout: z.number().min(1).max(3600).optional().default(60),
  alwaysAllow: z.array(z.string()).default([]),
  watchPaths: z.array(z.string()).optional(),
});

/**
 * Custom error messages for better user feedback
 */
const typeErrorMessage = "Server type must be either 'stdio' or 'sse'";
const stdioFieldsErrorMessage = "For 'stdio' type servers, you must provide a 'command' field and can optionally include 'args' and 'env'";
const sseFieldsErrorMessage = "For 'sse' type servers, you must provide a 'url' field and can optionally include 'headers'";
const mixedFieldsErrorMessage = "Cannot mix 'stdio' and 'sse' fields. For 'stdio' use 'command', 'args', and 'env'. For 'sse' use 'url' and 'headers'";
const missingFieldsErrorMessage = "Server configuration must include either 'command' (for stdio) or 'url' (for sse)";

/**
 * Helper function to create a refined schema with better error messages
 */
const createServerTypeSchema = () => {
  return z.union([
    // Stdio config (has command field)
    BaseConfigSchema.extend({
      type: z.enum(["stdio"]).optional(),
      command: z.string().min(1, "Command cannot be empty"),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      // Ensure no SSE fields are present
      url: z.undefined().optional(),
      headers: z.undefined().optional(),
    })
      .transform((data) => ({
        ...data,
        type: "stdio" as const,
      }))
      .refine((data) => data.type === undefined || data.type === "stdio", { message: typeErrorMessage }),
    
    // SSE config (has url field)
    BaseConfigSchema.extend({
      type: z.enum(["sse"]).optional(),
      url: z.string().url("URL must be a valid URL format"),
      headers: z.record(z.string()).optional(),
      // Ensure no stdio fields are present
      command: z.undefined().optional(),
      args: z.undefined().optional(),
      env: z.undefined().optional(),
    })
      .transform((data) => ({
        ...data,
        type: "sse" as const,
      }))
      .refine((data) => data.type === undefined || data.type === "sse", { message: typeErrorMessage }),
  ]);
};

/**
 * Server configuration schema with automatic type inference and validation
 */
export const ServerConfigSchema = createServerTypeSchema();

/**
 * Settings schema
 */
const McpSettingsSchema = z.object({
  mcpServers: z.record(ServerConfigSchema),
});

/**
 * Core class for managing MCP server connections.
 * This is a singleton class that is accessed through the McpServerManager.
 */
export class McpHub {
  /** Singleton instance */
  private static instance: McpHub | null = null;
  private provider: ApplicationProvider;
  private isDisposed: boolean = false;
  private fileWatchers: Map<string, any[]> = new Map();
  
  /** Active MCP connections */
  connections: McpConnection[] = [];
  
  /** Whether the hub is currently connecting to a server */
  isConnecting: boolean = false;

  /** Cached aggregated capabilities */
  private cachedTools: McpTool[] | null = null;
  private cachedResources: McpResource[] | null = null;
  private cachedPrompts: McpPrompt[] | null = null;
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache TTL

  /**
   * Create a new McpHub instance.
   * This constructor is private to enforce the singleton pattern.
   * Use McpHub.getInstance() to get the singleton instance.
   * 
   * @param provider The application provider
   */
  constructor(provider: ApplicationProvider) {
    this.provider = provider;
    this.provider.log('McpHub initialized');
    
    // Initialize MCP servers from settings
    this.initializeGlobalMcpServers();
  }

  /**
   * Get the singleton instance of the McpHub.
   * Creates a new instance if one doesn't exist.
   * 
   * @param provider The application provider
   * @returns The McpHub instance
   */
  public static getInstance(provider: ApplicationProvider): McpHub {
    if (!McpHub.instance) {
      McpHub.instance = new McpHub(provider);
    }
    return McpHub.instance;
  }

  /**
   * Initialize the McpHub with the provided application provider.
   * This is a convenience method that delegates to getInstance().
   * 
   * @param provider The application provider
   * @returns The McpHub instance
   */
  public static initialize(provider: ApplicationProvider): McpHub {
    return McpHub.getInstance(provider);
  }

  /**
   * Get all enabled MCP servers.
   * @returns Array of enabled MCP servers
   */
  getServers(): McpServer[] {
    // Only return enabled servers
    return this.connections.filter((conn) => !conn.server.disabled).map((conn) => conn.server);
  }

  /**
   * Get all MCP servers, including disabled ones.
   * @returns Array of all MCP servers
   */
  getAllServers(): McpServer[] {
    // Return all servers regardless of state
    return this.connections.map((conn) => conn.server);
  }

  /**
   * Initialize MCP servers from global settings.
   */
  private async initializeGlobalMcpServers(): Promise<void> {
    try {
      const settingsPath = await this.provider.getMcpSettingsFilePath();
      const content = await fs.readFile(settingsPath, 'utf-8');
      const config = JSON.parse(content);
      
      const result = McpSettingsSchema.safeParse(config);
      
      if (result.success) {
        await this.updateServerConnections(result.data.mcpServers || {}, 'global');
      } else {
        const errorMessages = result.error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join('\n');
        
        this.provider.log(`Invalid MCP settings format: ${errorMessages}`);
        
        // Still try to connect with the raw config, but show warnings
        try {
          await this.updateServerConnections(config.mcpServers || {}, 'global');
        } catch (error) {
          this.provider.log(`Failed to initialize MCP servers with raw config: ${error}`);
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.provider.log('Invalid MCP settings syntax');
      } else {
        this.provider.log(`Failed to initialize MCP servers: ${error}`);
      }
    }
  }

  /**
   * Update server connections based on configuration.
   * This method is called when the MCP settings are updated.
   * 
   * @param serverConfigs Map of server name to server configuration
   * @param source Source of the server configuration
   */
  async updateServerConnections(
    serverConfigs: Record<string, McpServerConfig>,
    source: McpServerSource = 'global'
  ): Promise<void> {
    this.provider.log(`Updating server connections from ${source}`);
    
    // Get the current server names for this source
    const currentServerNames = this.connections
      .filter(conn => conn.server.source === source)
      .map(conn => conn.server.name);
    
    // Get the new server names
    const newServerNames = Object.keys(serverConfigs);
    
    // Delete connections for servers that no longer exist
    for (const name of currentServerNames) {
      if (!newServerNames.includes(name)) {
        await this.deleteConnection(name, source);
      }
    }
    
    // Update or create connections for new/updated servers
    for (const [name, config] of Object.entries(serverConfigs)) {
      const existingConnection = this.findConnection(name, source);
      
      // If the server already exists and the config hasn't changed, skip it
      if (existingConnection && 
          JSON.stringify(existingConnection.server.config) === JSON.stringify(config)) {
        continue;
      }
      
      // Otherwise, create or update the connection
      try {
        await this.connectToServer(name, config, source);
      } catch (error) {
        this.provider.log(`Failed to connect to server ${name}: ${error}`);
      }
    }
    
    // Emit server connection events
    this.emitServerConnectionEvents();
  }

  /**
   * Find a connection by server name and optionally source.
   * @param serverName The name of the server
   * @param source Optional source of the server configuration
   * @returns The connection if found, undefined otherwise
   */
  private findConnection(serverName: string, source?: McpServerSource): McpConnection | undefined {
    return this.connections.find((conn) => {
      if (source) {
        return conn.server.name === serverName && conn.server.source === source;
      }
      return conn.server.name === serverName;
    });
  }

  /**
   * Get the list of tools provided by a server.
   * @param serverName The name of the server
   * @param source Optional source of the server configuration
   * @returns Array of tools provided by the server
   */
  async getToolsList(serverName: string, source?: McpServerSource): Promise<McpTool[]> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      this.provider.log(`Server ${serverName} not found`);
      return [];
    }
    
    try {
      const response = await connection.client.listTools();
      
      if (!response || !response.tools) {
        return [];
      }
      
      // Map the tools to our internal format
      return response.tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name || tool.id,
        description: tool.description || '',
        inputSchema: tool.input_schema || {},
        outputSchema: tool.output_schema || {},
        server: serverName,
        alwaysAllow: connection.server.config.alwaysAllow?.includes(tool.id) || false
      }));
    } catch (error) {
      this.provider.log(`Failed to get tools list from server ${serverName}: ${error}`);
      return [];
    }
  }

  /**
   * Get the list of resources provided by a server.
   * @param serverName The name of the server
   * @param source Optional source of the server configuration
   * @returns Array of resources provided by the server
   */
  async getResourcesList(serverName: string, source?: McpServerSource): Promise<McpResource[]> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      this.provider.log(`Server ${serverName} not found`);
      return [];
    }
    
    try {
      const response = await connection.client.listResources();
      
      if (!response || !response.resources) {
        return [];
      }
      
      // Map the resources to our internal format
      return response.resources.map((resource: any) => ({
        uri: resource.uri,
        name: resource.name || resource.uri,
        description: resource.description || '',
        server: serverName
      }));
    } catch (error) {
      this.provider.log(`Failed to get resources list from server ${serverName}: ${error}`);
      return [];
    }
  }

  /**
   * Get the list of resource templates provided by a server.
   * @param serverName The name of the server
   * @param source Optional source of the server configuration
   * @returns Array of resource templates provided by the server
   */
  async getResourceTemplatesList(serverName: string, source?: McpServerSource): Promise<McpResourceTemplate[]> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      this.provider.log(`Server ${serverName} not found`);
      return [];
    }
    
    try {
      const response = await connection.client.listResourceTemplates();
      
      if (!response || !response.templates) {
        return [];
      }
      
      // Map the templates to our internal format
      return response.templates.map((template: any) => ({
        id: template.id,
        name: template.name || template.id,
        description: template.description || '',
        parameterSchema: template.parameter_schema || {},
        server: serverName
      }));
    } catch (error) {
      this.provider.log(`Failed to get resource templates list from server ${serverName}: ${error}`);
      return [];
    }
  }

  /**
   * Get the list of prompts provided by a server.
   * @param serverName The name of the server
   * @param source Optional source of the server configuration
   * @returns Array of prompts provided by the server
   */
  async getPromptsList(serverName: string, source?: McpServerSource): Promise<McpPrompt[]> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      this.provider.log(`Server ${serverName} not found`);
      return [];
    }
    
    try {
      const response = await connection.client.listPrompts();
      
      if (!response || !response.prompts) {
        return [];
      }
      
      // Map the prompts to our internal format
      return response.prompts.map((prompt: any) => ({
        id: prompt.id,
        name: prompt.name || prompt.id,
        description: prompt.description || '',
        template: prompt.template || '',
        parameters: prompt.parameters || {},
        server: serverName
      }));
    } catch (error) {
      this.provider.log(`Failed to get prompts list from server ${serverName}: ${error}`);
      return [];
    }
  }

  /**
   * Call a tool provided by a server.
   * @param serverName The name of the server
   * @param toolId The ID of the tool to call
   * @param args The arguments to pass to the tool
   * @param source Optional source of the server configuration
   * @returns The response from the tool call
   */
  async callTool(
    serverName: string,
    toolId: string,
    args: Record<string, any>,
    source?: McpServerSource
  ): Promise<McpToolCallResponse> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      return {
        result: null,
        error: `Server ${serverName} not found`
      };
    }
    
    try {
      const response = await connection.client.callTool(toolId, args);
      
      return {
        result: response.result,
        error: response.error
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.provider.log(`Failed to call tool ${toolId} on server ${serverName}: ${errorMessage}`);
      
      return {
        result: null,
        error: errorMessage
      };
    }
  }

  /**
   * Read a resource provided by a server.
   * @param serverName The name of the server
   * @param uri The URI of the resource to read
   * @param source Optional source of the server configuration
   * @returns The response from the resource access
   */
  async readResource(
    serverName: string,
    uri: string,
    source?: McpServerSource
  ): Promise<McpResourceResponse> {
    const connection = this.findConnection(serverName, source);
    
    if (!connection) {
      return {
        content: '',
        error: `Server ${serverName} not found`
      };
    }
    
    try {
      const response = await connection.client.readResource(uri);
      
      return {
        content: response.content,
        mimeType: response.mime_type,
        error: response.error
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.provider.log(`Failed to read resource ${uri} from server ${serverName}: ${errorMessage}`);
      
      return {
        content: '',
        error: errorMessage
      };
    }
  }

  /**
   * Delete a connection to a server.
   * @param name The name of the server
   * @param source Optional source of the server configuration
   */
  async deleteConnection(name: string, source?: McpServerSource): Promise<void> {
    const connection = this.findConnection(name, source);
    
    if (!connection) {
      return;
    }
    
    this.provider.log(`Deleting connection to server ${name}`);
    
    try {
      // Close the transport if it exists
      if (connection.transport && typeof connection.transport.close === 'function') {
        await connection.transport.close();
      }
      
      // Remove the connection from the list
      this.connections = this.connections.filter((conn) => {
        if (source) {
          return !(conn.server.name === name && conn.server.source === source);
        }
        return conn.server.name !== name;
      });
      
      // Invalidate the cache when a server is disconnected
      this.invalidateCache();
    } catch (error) {
      this.provider.log(`Error closing connection to server ${name}: ${error}`);
    }
  }

  /**
   * Dispose of the McpHub instance and clean up resources.
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    
    this.isDisposed = true;
    this.provider.log('Disposing McpHub');
    
    // Clean up connections
    for (const connection of this.connections) {
      await this.deleteConnection(connection.server.name, connection.server.source);
    }
    
    // Clean up file watchers
    for (const watchers of this.fileWatchers.values()) {
      for (const watcher of watchers) {
        if (watcher && typeof watcher.close === 'function') {
          watcher.close();
        }
      }
    }
    
    this.fileWatchers.clear();
    this.connections = [];
  }

  /**
   * Connect to an MCP server.
   * @param name The name of the server
   * @param config The server configuration
   * @param source The source of the server configuration
   */
  public async connectToServer(
    name: string,
    config: McpServerConfig,
    source: McpServerSource = 'global'
  ): Promise<void> {
    // Remove existing connection if it exists
    await this.deleteConnection(name, source);
    
    this.isConnecting = true;
    
    try {
      // Create the server object
      const server: McpServer = {
        name,
        config,
        status: 'connecting',
        disabled: config.disabled || false,
        source,
        errors: []
      };
      
      // Create a client instance with the appropriate implementation info
      const clientInfo = {
        name: 'srcbook-mcp-client',
        version: '1.0.0'
      };
      
      // Create a new MCP client
      const client = new Client(clientInfo, {
        capabilities: {
          // Define client capabilities as needed
          resources: true,
          tools: true,
          prompts: true
        }
      });
      
      // Create a transport based on the server type
      let transport;
      
      if (config.type === 'stdio') {
        // Create a stdio transport
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
          cwd: config.cwd
        });
      } else {
        // Create an SSE transport
        const url = new URL(config.url);
        transport = new SSEClientTransport(url, {
          requestInit: config.headers ? { headers: config.headers } : undefined
        });
      }
      
      // Connect the client to the transport
      await client.connect(transport);
      
      // Create the connection
      const connection: McpConnection = {
        server,
        client,
        transport
      };
      
      // Add the connection to the list
      this.connections.push(connection);
      
      // Update the server status
      server.status = 'connected';
      
      // Set up file watchers if needed
      if (config.watchPaths && config.watchPaths.length > 0) {
        await this.setupFileWatchers(name, config.watchPaths, source);
      }
      
      // Invalidate the cache when a new server is connected
      this.invalidateCache();
      
      this.provider.log(`Connected to server ${name} (${config.type})`);
    } catch (error) {
      this.provider.log(`Failed to connect to server ${name}: ${error}`);
      
      // Create a disconnected server entry
      const server: McpServer = {
        name,
        config,
        status: 'error',
        disabled: config.disabled || false,
        source,
        errors: [error instanceof Error ? error.message : String(error)]
      };
      
      // Add a placeholder connection
      this.connections.push({
        server,
        client: {} as any,
        transport: {} as any
      });
    } finally {
      this.isConnecting = false;
    }
  }
  
  /**
   * Set up file watchers for a server.
   * @param serverName The name of the server
   * @param watchPaths The paths to watch
   * @param source The source of the server configuration
   */
  private async setupFileWatchers(
    serverName: string,
    watchPaths: string[],
    source: McpServerSource
  ): Promise<void> {
    this.provider.log(`Setting up file watchers for server ${serverName}: ${watchPaths.join(', ')}`);
    
    // Create an array to store the watchers for this server
    const watchers: any[] = [];
    
    // Import the fs module for file watching
    const fs = await import('fs');
    
    // Set up a watcher for each path
    for (const watchPath of watchPaths) {
      try {
        // Create a watcher for the path
        const watcher = fs.watch(watchPath, { recursive: true }, (eventType) => {
          if (eventType === 'change') {
            this.provider.log(`File changed in watch path ${watchPath} for server ${serverName}`);
            
            // Find the connection
            const connection = this.findConnection(serverName, source);
            if (connection && connection.server.status === 'connected') {
              this.provider.log(`Server ${serverName} will be restarted on next request due to file change`);
            }
          }
        });
        
        // Add the watcher to the array
        watchers.push(watcher);
      } catch (error) {
        this.provider.log(`Failed to set up watcher for path ${watchPath}: ${error}`);
      }
    }
    
    // Store the watchers in the map
    this.fileWatchers.set(`${serverName}:${source}`, watchers);
  }
  
  /**
   * Emit server connection events.
   * This notifies listeners about server connection changes.
   */
  private emitServerConnectionEvents(): void {
    // In a real implementation, you would emit events
    // For now, we'll just log the event
    this.provider.log('Server connections updated');
  }
  
  /**
   * Invalidate the cached capabilities.
   * This should be called when servers connect or disconnect.
   */
  private invalidateCache(): void {
    this.cachedTools = null;
    this.cachedResources = null;
    this.cachedPrompts = null;
    this.lastCacheUpdate = 0;
    this.provider.log('Capability cache invalidated');
  }

  /**
   * Check if the cache is still valid.
   * @returns True if the cache is valid, false otherwise
   */
  private isCacheValid(): boolean {
    return (
      this.lastCacheUpdate > 0 &&
      Date.now() - this.lastCacheUpdate < this.CACHE_TTL
    );
  }

  /**
   * Aggregate tools from all connected servers.
   * This method handles duplicate tools by keeping the first occurrence.
   * @returns Array of aggregated tools
   */
  async aggregateTools(): Promise<McpTool[]> {
    // Use cached tools if available and valid
    if (this.cachedTools !== null && this.isCacheValid()) {
      return this.cachedTools;
    }

    const tools: McpTool[] = [];
    const toolIds = new Set<string>();
    
    for (const connection of this.connections) {
      if (connection.server.disabled || connection.server.status !== 'connected') {
        continue;
      }
      
      const serverTools = await this.getToolsList(connection.server.name, connection.server.source);
      
      // Filter out duplicate tools (by ID)
      for (const tool of serverTools) {
        const toolKey = `${tool.server}:${tool.id}`;
        if (!toolIds.has(toolKey)) {
          toolIds.add(toolKey);
          tools.push(tool);
        }
      }
    }
    
    // Update cache
    this.cachedTools = tools;
    this.lastCacheUpdate = Date.now();
    
    return tools;
  }
  
  /**
   * Aggregate resources from all connected servers.
   * This method handles duplicate resources by keeping the first occurrence.
   * @returns Array of aggregated resources
   */
  async aggregateResources(): Promise<McpResource[]> {
    // Use cached resources if available and valid
    if (this.cachedResources !== null && this.isCacheValid()) {
      return this.cachedResources;
    }

    const resources: McpResource[] = [];
    const resourceUris = new Set<string>();
    
    for (const connection of this.connections) {
      if (connection.server.disabled || connection.server.status !== 'connected') {
        continue;
      }
      
      const serverResources = await this.getResourcesList(connection.server.name, connection.server.source);
      
      // Filter out duplicate resources (by URI)
      for (const resource of serverResources) {
        const resourceKey = `${resource.server}:${resource.uri}`;
        if (!resourceUris.has(resourceKey)) {
          resourceUris.add(resourceKey);
          resources.push(resource);
        }
      }
    }
    
    // Update cache
    this.cachedResources = resources;
    this.lastCacheUpdate = Date.now();
    
    return resources;
  }

  /**
   * Aggregate prompts from all connected servers.
   * This method handles duplicate prompts by keeping the first occurrence.
   * @returns Array of aggregated prompts
   */
  async aggregatePrompts(): Promise<McpPrompt[]> {
    // Use cached prompts if available and valid
    if (this.cachedPrompts !== null && this.isCacheValid()) {
      return this.cachedPrompts;
    }

    const prompts: McpPrompt[] = [];
    const promptIds = new Set<string>();
    
    for (const connection of this.connections) {
      if (connection.server.disabled || connection.server.status !== 'connected') {
        continue;
      }
      
      const serverPrompts = await this.getPromptsList(connection.server.name, connection.server.source);
      
      // Filter out duplicate prompts (by ID)
      for (const prompt of serverPrompts) {
        const promptKey = `${prompt.server}:${prompt.id}`;
        if (!promptIds.has(promptKey)) {
          promptIds.add(promptKey);
          prompts.push(prompt);
        }
      }
    }
    
    // Update cache
    this.cachedPrompts = prompts;
    this.lastCacheUpdate = Date.now();
    
    return prompts;
  }
  
  /**
   * Get all available tools from connected servers.
   * @returns Array of all available tools
   */
  async getTools(): Promise<McpTool[]> {
    return this.aggregateTools();
  }
  
  /**
   * Get all available resources from connected servers.
   * @returns Array of all available resources
   */
  async getResources(): Promise<McpResource[]> {
    return this.aggregateResources();
  }

  /**
   * Get all available prompts from connected servers.
   * @returns Array of all available prompts
   */
  async getPrompts(): Promise<McpPrompt[]> {
    return this.aggregatePrompts();
  }
  
  /**
   * Execute a tool on a specific server.
   * @param serverName The name of the server
   * @param toolId The ID of the tool to execute
   * @param args The arguments to pass to the tool
   * @param source Optional source of the server configuration
   * @returns The response from the tool execution
   */
  async executeTool(
    serverName: string,
    toolId: string,
    args: Record<string, any>,
    source?: McpServerSource
  ): Promise<McpToolCallResponse> {
    return this.callTool(serverName, toolId, args, source);
  }
  
  /**
   * Access a resource from a specific server.
   * @param serverName The name of the server
   * @param uri The URI of the resource to access
   * @param source Optional source of the server configuration
   * @returns The response from the resource access
   */
  async accessResource(
    serverName: string,
    uri: string,
    source?: McpServerSource
  ): Promise<McpResourceResponse> {
    return this.readResource(serverName, uri, source);
  }
  
  /**
   * Event handler for when a server is connected.
   * @param serverName The name of the server
   * @param source The source of the server configuration
   */
  onServerConnected(serverName: string, source: McpServerSource): void {
    this.provider.log(`Server ${serverName} connected`);
    // In a real implementation, you would emit an event
  }
  
  /**
   * Event handler for when a server is disconnected.
   * @param serverName The name of the server
   * @param source The source of the server configuration
   */
  onServerDisconnected(serverName: string, source: McpServerSource): void {
    this.provider.log(`Server ${serverName} disconnected`);
    // In a real implementation, you would emit an event
  }
}