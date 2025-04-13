/**
 * Model Context Protocol (MCP) client implementation for Srcbook.
 * This module provides functionality for connecting to and interacting with MCP servers.
 */

// Export types
export * from './types.mjs';

// Import required dependencies for local use
import { type ApplicationProvider } from './ApplicationProvider.mjs';
import { McpServerManager } from './McpServerManager.mjs';

// Export ApplicationProvider
export { 
  type ApplicationProvider,
  DefaultApplicationProvider
} from './ApplicationProvider.mjs';

// Export McpHub
export { 
  McpHub,
  ServerConfigSchema
} from './McpHub.mjs';

// Export McpServerManager
export { McpServerManager } from './McpServerManager.mjs';

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