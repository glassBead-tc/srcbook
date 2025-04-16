/**
 * MCP Tools Formatter
 * 
 * This module provides functions to format MCP tools for AI consumption.
 * It converts MCP tool definitions into a format that can be included in AI prompts.
 */

import { getMCPClientManager, type MCPTool } from '../mcp/client-manager.mjs';

/**
 * Format MCP tools for inclusion in AI prompts
 * 
 * @returns A formatted string describing all available MCP tools
 */
export async function formatMCPToolsForAI(): Promise<string> {
  try {
    // Get the MCP client manager
    const clientManager = getMCPClientManager();
    
    // Get all available tools
    const tools = await clientManager.getTools();
    
    if (tools.length === 0) {
      return "No MCP tools are available.";
    }
    
    // Format the tools as a string
    return formatToolsAsString(tools);
  } catch (error) {
    console.error('Error formatting MCP tools for AI:', error);
    return "Error retrieving MCP tools.";
  }
}

/**
 * Format a list of MCP tools as a string
 * 
 * @param tools The list of MCP tools to format
 * @returns A formatted string describing the tools
 */
function formatToolsAsString(tools: MCPTool[]): string {
  // Start with a header
  let result = "## Available MCP Tools\n\n";
  result += "You can use the following tools to perform actions:\n\n";
  
  // Add each tool
  tools.forEach((tool) => {
    // Add tool name and description
    result += `### ${tool.name}\n`;
    if (tool.annotations?.title) {
      result += `**${tool.annotations.title}**\n`;
    }
    if (tool.description) {
      result += `${tool.description}\n`;
    }
    
    // Add tool annotations as hints
    const hints: string[] = [];
    if (tool.annotations?.readOnlyHint) hints.push("Read-only");
    if (tool.annotations?.destructiveHint) hints.push("Destructive");
    if (tool.annotations?.idempotentHint) hints.push("Idempotent");
    if (tool.annotations?.openWorldHint) hints.push("Interacts with external systems");
    
    if (hints.length > 0) {
      result += `**Hints:** ${hints.join(", ")}\n`;
    }
    
    // Add input schema
    result += "\n**Input Schema:**\n";
    result += "```json\n";
    result += JSON.stringify(tool.inputSchema, null, 2);
    result += "\n```\n\n";
    
    // Add server ID
    result += `**Server:** ${tool.serverId}\n\n`;
    
    // Add separator between tools
    result += "---\n\n";
  });
  
  // Add usage instructions
  result += `## How to Use These Tools

To use a tool, include a tool call in your response using the following format:

\`\`\`
<tool name="TOOL_NAME" server="SERVER_ID">
{
  "param1": "value1",
  "param2": "value2"
}
</tool>
\`\`\`

Replace TOOL_NAME with the name of the tool you want to use, SERVER_ID with the server ID, and include the appropriate parameters as specified in the tool's input schema.
`;
  
  return result;
}

/**
 * Get the list of MCP tools
 * 
 * @returns The list of available MCP tools
 */
export async function getMCPTools(): Promise<MCPTool[]> {
  try {
    const clientManager = getMCPClientManager();
    return await clientManager.getTools();
  } catch (error) {
    console.error('Error getting MCP tools:', error);
    return [];
  }
}
