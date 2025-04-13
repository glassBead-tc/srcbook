/**
 * Model Context Protocol (MCP) client implementation for Srcbook.
 * This module provides functionality for connecting to and interacting with MCP servers.
 */

// Export types
export * from './types';

// Export ApplicationProvider
export { 
  ApplicationProvider,
  DefaultApplicationProvider
} from './ApplicationProvider';

// Export McpHub
export { 
  McpHub,
  ServerConfigSchema
} from './McpHub';

// Export McpServerManager
export { McpServerManager } from './McpServerManager';

/**
 * Initialize the MCP client with the provided application provider.
 * This is the main entry point for using the MCP client.
 * 
 * @param provider The application provider
 * @returns The McpHub instance
 */
export async function initializeMcp(provider: ApplicationProvider) {
  return McpServerManager.getInstance(provider);
}

/**
 * TODO: Add more functionality as needed for the MCP client.
 */