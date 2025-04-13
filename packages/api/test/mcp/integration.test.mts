import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpHub } from '../../mcp/McpHub.mjs';
import { McpServerManager } from '../../mcp/McpServerManager.mjs';
import { ApplicationProvider } from '../../mcp/ApplicationProvider.mjs';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { StreamingXMLParser } from '../../ai/stream-xml-parser.mjs';
import { generateApp } from '../../ai/generate.mjs';

// Create mock data for tests
const mockTools = [
  {
    id: 'test-tool',
    name: 'Test Tool',
    description: 'A test tool',
    input_schema: {
      type: 'object',
      properties: {
        param: {
          type: 'string',
        },
      },
    },
  }
];

const mockResources = [
  {
    uri: 'test-resource',
    name: 'Test Resource',
    description: 'A test resource',
  }
];

// Mock the SDK client
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: mockTools }),
    listResources: vi.fn().mockResolvedValue({ resources: mockResources }),
    listResourceTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    callTool: vi.fn().mockImplementation(async (toolId: string, args: any) => {
      if (toolId === 'test-tool') {
        return { result: `Tool called with args: ${JSON.stringify(args)}` };
      }
      throw new Error(`Tool not found: ${toolId}`);
    }),
    readResource: vi.fn().mockImplementation(async (uri: string) => {
      if (uri === 'test-resource') {
        return { content: 'Resource content', mime_type: 'text/plain' };
      }
      throw new Error(`Resource not found: ${uri}`);
    }),
  })),
}));

// Mock the transports
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockImplementation((path) => {
    if (path.includes('settings')) {
      return Promise.resolve(JSON.stringify({
        mcpServers: {
          'test-server': {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
          }
        }
      }));
    }
    return Promise.resolve('{"mcpServers": {}}');
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ mtimeMs: 123456789 }),
}));

// Mock fs
vi.mock('fs', () => ({
  watch: vi.fn().mockReturnValue({
    close: vi.fn(),
  }),
}));

// Mock the AI generation
vi.mock('../../ai/generate.mjs', () => ({
  generateApp: vi.fn(),
}));

// Helper function to parse XML content with MCP tool calls and resource access
function parseXml(xmlContent: string): any[] {
  const result: any[] = [];
  
  const parser = new StreamingXMLParser({
    onTag: (tag) => {
      if (tag.name === 'use_mcp_tool') {
        const serverNameTag = tag.children.find(child => child.name === 'server_name');
        const toolNameTag = tag.children.find(child => child.name === 'tool_name');
        const argumentsTag = tag.children.find(child => child.name === 'arguments');
        
        if (serverNameTag && toolNameTag && argumentsTag) {
          result.push({
            type: 'use_mcp_tool',
            server_name: serverNameTag.content,
            tool_name: toolNameTag.content,
            arguments: argumentsTag.content
          });
        }
      } else if (tag.name === 'access_mcp_resource') {
        const serverNameTag = tag.children.find(child => child.name === 'server_name');
        const uriTag = tag.children.find(child => child.name === 'uri');
        
        if (serverNameTag && uriTag) {
          result.push({
            type: 'access_mcp_resource',
            server_name: serverNameTag.content,
            uri: uriTag.content
          });
        }
      }
    }
  });
  
  // Parse the XML content
  parser.parse(xmlContent);
  
  return result;
}

// Create a mock ApplicationProvider
class MockApplicationProvider implements ApplicationProvider {
  getApplicationName(): string {
    return 'test-app';
  }

  getApplicationVersion(): string {
    return '1.0.0';
  }

  async ensureDirectoryExists(dirPath: string): Promise<string> {
    return dirPath;
  }

  async getMcpServersPath(): Promise<string> {
    return '/test/mcp-servers';
  }

  async getMcpSettingsFilePath(): Promise<string> {
    return '/test/settings/mcp-settings.json';
  }

  async fileExistsAtPath(filePath: string): Promise<boolean> {
    return true;
  }

  async postMessageToUi(message: any): Promise<void> {
    // Do nothing
  }

  log(message: string): void {
    // Do nothing
  }
}

describe('MCP Integration Tests', () => {
  let provider: ApplicationProvider;
  let mcpHub: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a new provider for each test
    provider = new MockApplicationProvider();
    
    // Initialize McpHub
    mcpHub = McpHub.initialize(provider);
    
    // Initialize McpServerManager
    await McpServerManager.getInstance(provider);
  });

  afterEach(async () => {
    // Clean up after each test
    await McpServerManager.cleanup();
    // Only call dispose if mcpHub exists
    if (mcpHub && typeof mcpHub.dispose === 'function') {
      await mcpHub.dispose();
    }
  });

  describe('End-to-End Flow', () => {
    it('should process AI-generated XML with MCP tool calls', async () => {
      // Mock AI generation to return XML with a tool call
      (generateApp as any).mockResolvedValueOnce(`
          I'll help you with that task.
          
          <use_mcp_tool>
          <server_name>test-server</server_name>
          <tool_name>test-tool</tool_name>
          <arguments>
          {
            "param": "test value"
          }
          </arguments>
          </use_mcp_tool>
          
          The tool has been executed successfully.
        `);
      
      // Parse the XML
      const aiResponse = await generateApp('test-project', [], 'Test prompt');
      const parsedResponse = parseXml(aiResponse);
      
      // Find the tool call
      const toolCall = parsedResponse.find((item: any) => item.type === 'use_mcp_tool');
      expect(toolCall).toBeDefined();
      
      if (toolCall) {
        // Execute the tool
        const result = await McpServerManager.executeTool(
          toolCall.server_name,
          toolCall.tool_name,
          JSON.parse(toolCall.arguments)
        );
        
        // Verify the result
        expect(result).toEqual({
          result: 'Tool called with args: {"param":"test value"}',
        });
      }
    });

    it('should process AI-generated XML with MCP resource access', async () => {
      // Mock AI generation to return XML with a resource access
      (generateApp as any).mockResolvedValueOnce(`
          I'll help you with that task.
          
          <access_mcp_resource>
          <server_name>test-server</server_name>
          <uri>test-resource</uri>
          </access_mcp_resource>
          
          The resource has been accessed successfully.
        `);
      
      // Parse the XML
      const aiResponse = await generateApp('test-project', [], 'Test prompt');
      const parsedResponse = parseXml(aiResponse);
      
      // Find the resource access
      const resourceAccess = parsedResponse.find((item: any) => item.type === 'access_mcp_resource');
      expect(resourceAccess).toBeDefined();
      
      if (resourceAccess) {
        // Access the resource
        const result = await McpServerManager.accessResource(
          resourceAccess.server_name,
          resourceAccess.uri
        );
        
        // Verify the result
        expect(result).toEqual({
          content: 'Resource content',
          mime_type: 'text/plain',
        });
      }
    });
  });

  describe('Server Connection Management', () => {
    it('should connect to a server based on configuration changes', async () => {
      // Mock readFile to return a new configuration
      (fs.readFile as any).mockResolvedValueOnce(JSON.stringify({
        mcpServers: {
          'test-server': {
            type: 'sse',
            url: 'http://localhost:3000/mcp',
          },
        },
      }));
      
      // Simulate a file change event
      const watchCallback = (fsSync.watch as any).mock.calls[0][1];
      await watchCallback('change');
      
      // Get the connected servers
      const servers = await McpServerManager.getConnectedServers();
      
      // Verify that both servers are connected
      expect(servers.length).toBe(2);
      expect(servers.some((s) => s.name === 'test-server')).toBe(true);
    });

    it('should disconnect from a server based on configuration changes', async () => {
      // Mock readFile to return a new configuration without the test server
      (fs.readFile as any).mockResolvedValueOnce(JSON.stringify({
        mcpServers: {},
      }));
      
      // Simulate a file change event
      const watchCallback = (fsSync.watch as any).mock.calls[0][1];
      await watchCallback('change');
      
      // Get the connected servers
      const servers = await McpServerManager.getConnectedServers();
      
      // Verify that no servers are connected
      expect(servers.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when calling a non-existent tool', async () => {
      // Try to call a non-existent tool
      const result = await McpServerManager.executeTool(
        'test-server',
        'non-existent-tool',
        { param: 'test value' }
      );
      
      // Verify that the error is handled
      expect(result.error).toBeDefined();
      expect(result.result).toBeNull();
    });

    it('should handle errors when accessing a non-existent resource', async () => {
      // Try to access a non-existent resource
      const result = await McpServerManager.accessResource(
        'test-server',
        'non-existent-resource'
      );
      
      // Verify that the error is handled
      expect(result.error).toBeDefined();
      expect(result.content).toBe('');
    });

    it('should handle errors when connecting to a non-existent server', async () => {
      // Try to connect to a non-existent server
      const result = await McpServerManager.connectServer('non-existent-server', provider);
      
      // Verify that the error is handled
      expect(result).toBe(false);
    });
  });
});