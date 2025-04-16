/**
 * MCP Tools for App Builder
 *
 * This module provides functions to execute MCP tools from the app builder.
 */

import { getMCPClientManager } from '../mcp/client-manager.mjs';

/**
 * Execute an MCP tool
 *
 * @param toolName The name of the tool to execute
 * @param serverId The ID of the server hosting the tool
 * @param parameters The parameters to pass to the tool
 * @returns The result of the tool execution
 */
export async function executeMCPTool(
  toolName: string,
  serverId: string,
  parametersJson: string,
): Promise<any> {
  try {
    // Parse the parameters
    const parameters = JSON.parse(parametersJson);

    // Get the MCP client manager
    const clientManager = getMCPClientManager();

    // Initialize the client manager if needed
    if (!clientManager.isInitialized) {
      await clientManager.initialize();
    }

    // Find the tool
    const tools = await clientManager.getTools();
    const tool = tools.find((t) => t.name === toolName && t.serverId === serverId);

    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverId}`);
    }

    console.log(
      `Executing MCP tool ${toolName} on server ${serverId} with parameters:`,
      parameters,
    );

    // Call the tool
    const result = await clientManager.callTool(serverId, toolName, parameters);

    return result;
  } catch (error) {
    console.error(`Error executing MCP tool ${toolName}:`, error);
    throw error;
  }
}
