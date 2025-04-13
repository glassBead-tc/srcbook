/**
 * Type definitions for the Model Context Protocol (MCP) client implementation.
 * These types define the core interfaces and structures used throughout the MCP module.
 */

/**
 * Represents an MCP server connection type.
 */
export type McpServerType = 'stdio' | 'sse';

/**
 * Represents the source of an MCP server configuration.
 */
export type McpServerSource = 'global' | 'project';

/**
 * Represents the status of an MCP server connection.
 */
export type McpServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Base configuration for MCP servers with common settings.
 */
export interface McpServerConfigBase {
  /** Whether the server is disabled */
  disabled?: boolean;
  /** Timeout in seconds for server operations */
  timeout?: number;
  /** List of tool IDs that are always allowed without confirmation */
  alwaysAllow?: string[];
  /** Paths to watch for changes and restart server */
  watchPaths?: string[];
}

/**
 * Configuration for stdio-based MCP servers.
 */
export interface McpStdioServerConfig extends McpServerConfigBase {
  /** Server type */
  type: 'stdio';
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables for the command */
  env?: Record<string, string>;
}

/**
 * Configuration for SSE-based MCP servers.
 */
export interface McpSseServerConfig extends McpServerConfigBase {
  /** Server type */
  type: 'sse';
  /** URL to connect to */
  url: string;
  /** HTTP headers to include in the request */
  headers?: Record<string, string>;
}

/**
 * Union type for all MCP server configurations.
 */
export type McpServerConfig = McpStdioServerConfig | McpSseServerConfig;

/**
 * Represents an MCP server instance.
 */
export interface McpServer {
  /** Unique name of the server */
  name: string;
  /** Server configuration */
  config: McpServerConfig;
  /** Current connection status */
  status: McpServerStatus;
  /** Whether the server is disabled */
  disabled: boolean;
  /** Source of the server configuration */
  source: McpServerSource;
  /** Error messages if any */
  errors?: string[];
}

/**
 * Represents an MCP tool provided by a server.
 */
export interface McpTool {
  /** Unique identifier for the tool */
  id: string;
  /** Human-readable name of the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Schema for the tool's input parameters */
  inputSchema: Record<string, any>;
  /** Schema for the tool's output */
  outputSchema?: Record<string, any>;
  /** Server that provides this tool */
  server: string;
  /** Whether this tool is always allowed without confirmation */
  alwaysAllow?: boolean;
}

/**
 * Represents a response from an MCP tool call.
 */
export interface McpToolCallResponse {
  /** Result of the tool call */
  result: any;
  /** Error message if the call failed */
  error?: string;
}

/**
 * Represents an MCP resource provided by a server.
 */
export interface McpResource {
  /** URI of the resource */
  uri: string;
  /** Human-readable name of the resource */
  name: string;
  /** Description of the resource */
  description: string;
  /** Server that provides this resource */
  server: string;
}

/**
 * Represents a response from an MCP resource access.
 */
export interface McpResourceResponse {
  /** Content of the resource */
  content: string;
  /** MIME type of the content */
  mimeType?: string;
  /** Error message if the access failed */
  error?: string;
}

/**
 * Represents a template for creating MCP resources.
 */
export interface McpResourceTemplate {
  /** Template ID */
  id: string;
  /** Human-readable name of the template */
  name: string;
  /** Description of the template */
  description: string;
  /** Schema for the template parameters */
  parameterSchema: Record<string, any>;
  /** Server that provides this template */
  server: string;
}

/**
 * Settings schema for MCP configuration.
 */
export interface McpSettings {
  /** Map of server name to server configuration */
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Represents a connection to an MCP server.
 * This is an internal type used by the McpHub.
 */
export interface McpConnection {
  /** Server information */
  server: McpServer;
  /** Client instance */
  client: any; // Will be replaced with actual SDK client type
  /** Transport used for communication */
  transport: any; // Will be replaced with actual SDK transport type
}
/**
 * Represents a prompt provided by an MCP server.
 */
export interface McpPrompt {
  /** Unique identifier for the prompt */
  id: string;
  /** Human-readable name of the prompt */
  name: string;
  /** Description of the prompt */
  description: string;
  /** The prompt template text */
  template: string;
  /** Optional parameters for the prompt */
  parameters?: Record<string, any>;
  /** Server that provides this prompt */
  server: string;
}

/**
 * Represents a response from a prompt request.
 */
export interface McpPromptResponse {
  /** The generated text from the prompt */
  text: string;
  /** Error message if the prompt generation failed */
  error?: string;
}

/**
 * TODO: Add more types as needed for the MCP implementation.
 */