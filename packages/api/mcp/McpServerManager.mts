/**
 * McpServerManager - Singleton manager for MCP server instances.
 * Ensures only one set of MCP servers runs across all application instances.
 * Manages the lifecycle of MCP server connections and provides access to their capabilities.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

import { McpHub } from './McpHub.mjs';
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
  McpSettings
} from './types.mjs';

/**
 * Events emitted by the McpServerManager
 */
export enum McpServerManagerEvents {
  SERVER_CONNECTED = 'server-connected',
  SERVER_DISCONNECTED = 'server-disconnected',
  SERVER_ERROR = 'server-error',
  CONFIG_CHANGED = 'config-changed'
}

/**
 * Singleton manager for MCP server instances.
 * Ensures only one set of MCP servers runs across all application instances.
 * Manages the lifecycle of MCP server connections and provides access to their capabilities.
 */
export class McpServerManager extends EventEmitter {
  private static instance: McpHub | null = null;
  private static readonly GLOBAL_STATE_KEY = 'mcpHubInstanceId';
  private static providers: Set<ApplicationProvider> = new Set();
  private static initializationPromise: Promise<McpHub> | null = null;
  private static refCount: number = 0;
  private static configWatcher: fsSync.FSWatcher | null = null;
  private static initialized: boolean = false;
  private static configPath: string = 'srcbook_mcp_config.json';
  private static configLastModified: number = 0;

  /**
   * Get the singleton McpHub instance.
   * Creates a new instance if one doesn't exist.
   * Thread-safe implementation using a promise-based lock.
   *
   * @param provider The application provider
   * @returns The McpHub instance
   */
  static async getInstance(provider: ApplicationProvider): Promise<McpHub> {
    // Register the provider
    this.providers.add(provider);
    this.refCount++;
    
    provider.log(`McpServerManager: Provider registered. Ref count: ${this.refCount}`);

    // If we already have an instance, return it
    if (this.instance) {
      return this.instance;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Create a new initialization promise
    this.initializationPromise = (async () => {
      try {
        // Double-check instance in case it was created while we were waiting
        if (!this.instance) {
          this.instance = new McpHub(provider);
          
          // Store a unique identifier to track the primary instance
          const instanceId = Date.now().toString();
          provider.log(`McpServerManager: Created new McpHub instance with ID ${instanceId}`);
          
          // Initialize the manager if not already initialized
          if (!this.initialized) {
            await this.initialize(provider);
          }
        }
        return this.instance;
      } finally {
        // Clear the initialization promise after completion or error
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Initialize the McpServerManager with the provided application provider.
   * This sets up configuration watching and connects to configured servers.
   *
   * @param provider The application provider
   */
  static async initialize(provider: ApplicationProvider): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    provider.log('McpServerManager: Initializing');
    
    try {
      // Load configuration and connect to servers
      await this.loadConfiguration(provider);
      
      // Set up configuration file watching
      await this.setupConfigWatcher(provider);
      
      this.initialized = true;
      provider.log('McpServerManager: Initialization complete');
    } catch (error) {
      provider.log(`McpServerManager: Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Load MCP server configuration from the config file and connect to servers.
   *
   * @param provider The application provider
   */
  private static async loadConfiguration(provider: ApplicationProvider): Promise<void> {
    provider.log('McpServerManager: Loading configuration');
    
    try {
      // Check if the config file exists
      const configExists = await provider.fileExistsAtPath(this.configPath);
      
      if (!configExists) {
        provider.log(`McpServerManager: Configuration file not found at ${this.configPath}`);
        return;
      }
      
      // Read and parse the configuration file
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as McpSettings;
      
      if (!config.mcpServers) {
        provider.log('McpServerManager: No MCP servers configured');
        return;
      }
      
      // Connect to all configured servers
      if (this.instance) {
        await this.instance.updateServerConnections(config.mcpServers, 'global');
        provider.log(`McpServerManager: Connected to ${Object.keys(config.mcpServers).length} servers`);
      }
    } catch (error) {
      provider.log(`McpServerManager: Failed to load configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Set up a watcher for the configuration file to detect changes.
   *
   * @param provider The application provider
   */
  private static async setupConfigWatcher(provider: ApplicationProvider): Promise<void> {
    provider.log(`McpServerManager: Setting up config watcher for ${this.configPath}`);
    
    try {
      // Get the initial file stats to track last modified time
      const stats = await fs.stat(this.configPath);
      this.configLastModified = stats.mtimeMs;
      
      // Set up a file watcher to detect changes to the config file
      this.configWatcher = fsSync.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          // Check if the file was actually modified to avoid duplicate events
          fs.stat(this.configPath).then(stats => {
            if (stats.mtimeMs > this.configLastModified) {
              this.configLastModified = stats.mtimeMs;
              this.handleConfigChange(provider);
            }
          }).catch(error => {
            provider.log(`McpServerManager: Error checking file stats: ${error}`);
          });
        }
      });
      
      provider.log('McpServerManager: Config watcher set up successfully');
    } catch (error) {
      provider.log(`McpServerManager: Failed to set up config watcher: ${error}`);
    }
  }

  /**
   * Handle changes to the configuration file.
   * This is called when the configuration file is modified.
   *
   * @param provider The application provider
   */
  static async handleConfigChange(provider: ApplicationProvider): Promise<void> {
    provider.log('McpServerManager: Configuration changed, reloading');
    
    try {
      await this.loadConfiguration(provider);
      await this.notifyProviders({
        type: McpServerManagerEvents.CONFIG_CHANGED
      });
    } catch (error) {
      provider.log(`McpServerManager: Failed to handle config change: ${error}`);
    }
  }

  /**
   * Connect to a specific MCP server.
   *
   * @param serverName The name of the server to connect to
   * @param provider The application provider
   * @returns True if the connection was successful, false otherwise
   */
  static async connectServer(serverName: string, provider: ApplicationProvider): Promise<boolean> {
    provider.log(`McpServerManager: Connecting to server ${serverName}`);
    
    try {
      // Check if the config file exists
      const configExists = await provider.fileExistsAtPath(this.configPath);
      
      if (!configExists) {
        provider.log(`McpServerManager: Configuration file not found at ${this.configPath}`);
        return false;
      }
      
      // Read and parse the configuration file
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as McpSettings;
      
      if (!config.mcpServers || !config.mcpServers[serverName]) {
        provider.log(`McpServerManager: Server ${serverName} not found in configuration`);
        return false;
      }
      
      // Connect to the server
      if (this.instance) {
        const serverConfig = config.mcpServers[serverName];
        await this.instance.connectToServer(serverName, serverConfig, 'global');
        
        // Notify providers of the connection
        await this.notifyProviders({
          type: McpServerManagerEvents.SERVER_CONNECTED,
          serverName
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      provider.log(`McpServerManager: Failed to connect to server ${serverName}: ${error}`);
      
      // Notify providers of the error
      await this.notifyProviders({
        type: McpServerManagerEvents.SERVER_ERROR,
        serverName,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return false;
    }
  }

  /**
   * Disconnect from a specific MCP server.
   *
   * @param serverName The name of the server to disconnect from
   * @param provider The application provider
   * @returns True if the disconnection was successful, false otherwise
   */
  static async disconnectServer(serverName: string, provider: ApplicationProvider): Promise<boolean> {
    provider.log(`McpServerManager: Disconnecting from server ${serverName}`);
    
    try {
      // Disconnect from the server
      if (this.instance) {
        await this.instance.deleteConnection(serverName, 'global');
        
        // Notify providers of the disconnection
        await this.notifyProviders({
          type: McpServerManagerEvents.SERVER_DISCONNECTED,
          serverName
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      provider.log(`McpServerManager: Failed to disconnect from server ${serverName}: ${error}`);
      return false;
    }
  }

  /**
   * Get all connected MCP servers.
   *
   * @returns Array of connected MCP servers
   */
  static async getConnectedServers(): Promise<McpServer[]> {
    if (!this.instance) {
      return [];
    }
    
    return this.instance.getServers();
  }

  /**
   * Get the capabilities of a specific MCP server.
   *
   * @param serverName The name of the server
   * @returns Object containing the server's tools and resources
   */
  static async getServerCapabilities(serverName: string): Promise<{
    tools: McpTool[];
    resources: McpResource[];
  }> {
    if (!this.instance) {
      return { tools: [], resources: [] };
    }
    
    const tools = await this.instance.getToolsList(serverName);
    const resources = await this.instance.getResourcesList(serverName);
    
    return { tools, resources };
  }

  /**
   * Execute a tool on a specific server.
   *
   * @param serverName The name of the server
   * @param toolId The ID of the tool to execute
   * @param args The arguments to pass to the tool
   * @returns The response from the tool execution
   */
  static async executeTool(
    serverName: string,
    toolId: string,
    args: Record<string, any>
  ): Promise<McpToolCallResponse> {
    if (!this.instance) {
      return {
        result: null,
        error: 'McpServerManager not initialized'
      };
    }
    
    return this.instance.executeTool(serverName, toolId, args);
  }

  /**
   * Access a resource from a specific server.
   *
   * @param serverName The name of the server
   * @param uri The URI of the resource to access
   * @returns The response from the resource access
   */
  static async accessResource(
    serverName: string,
    uri: string
  ): Promise<McpResourceResponse> {
    if (!this.instance) {
      return {
        content: '',
        error: 'McpServerManager not initialized'
      };
    }
    
    return this.instance.accessResource(serverName, uri);
  }

  /**
   * Remove a provider from the tracked set.
   * This is called when an application instance is disposed.
   *
   * @param provider The application provider to unregister
   */
  static async unregisterProvider(provider: ApplicationProvider): Promise<void> {
    this.providers.delete(provider);
    this.refCount--;
    
    provider.log(`McpServerManager: Provider unregistered. Ref count: ${this.refCount}`);
    
    if (this.refCount <= 0) {
      provider.log('McpServerManager: Last provider unregistered. Disposing hub.');
      await this.cleanup();
    }
  }

  /**
   * Notify all registered providers of server state changes.
   *
   * @param message The message to send to all providers
   */
  static async notifyProviders(message: any): Promise<void> {
    const promises = Array.from(this.providers).map(provider => {
      return provider.postMessageToUi(message).catch((error: Error) => {
        provider.log(`McpServerManager: Failed to notify provider: ${error.message}`);
      });
    });
    
    await Promise.all(promises);
  }

  /**
   * Clean up the singleton instance and all its resources.
   */
  static async cleanup(): Promise<void> {
    if (this.instance) {
      await this.instance.dispose();
      this.instance = null;
    }
    
    // Clean up the config watcher if it exists
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = null;
    }
    
    this.providers.clear();
    this.refCount = 0;
    this.initialized = false;
  }
}