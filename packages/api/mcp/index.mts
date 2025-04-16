/**
 * MCP (Model Context Protocol) Integration
 * 
 * This module exports the MCP client manager and related utilities for
 * integrating with MCP servers.
 */

export { 
  MCPClientManager, 
  getMCPClientManager, 
  type MCPTool, 
  type MCPConfig, 
  type MCPServerConfig 
} from './client-manager.mjs';

// Export a function to initialize the MCP client manager
export async function initializeMCP(): Promise<void> {
  const { getMCPClientManager } = await import('./client-manager.mjs');
  const clientManager = getMCPClientManager();
  await clientManager.initialize();
}
