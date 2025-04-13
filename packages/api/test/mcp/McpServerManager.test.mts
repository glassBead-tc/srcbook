import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpHub } from '../../mcp/McpHub.mjs';
import { McpServerManager } from '../../mcp/McpServerManager.mjs';
import { ApplicationProvider } from '../../mcp/ApplicationProvider.mjs';
import { McpServerConfig } from '../../mcp/types.mjs';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { MockApplicationProvider, setupConsoleSpy } from '../test-helpers.mjs';

// Mock McpHub
const mockMcpHub = {
  updateServerConnections: vi.fn().mockResolvedValue(undefined),
  connectToServer: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  getServers: vi.fn().mockReturnValue([]),
  getToolsList: vi.fn().mockResolvedValue([]),
  getResourcesList: vi.fn().mockResolvedValue([]),
  executeTool: vi.fn().mockResolvedValue({ result: 'success' }),
  accessResource: vi.fn().mockResolvedValue({ content: 'resource content' }),
  dispose: vi.fn().mockResolvedValue(undefined),
};

// Mock the McpHub module
vi.mock('../../mcp/McpHub.mjs', () => ({
  McpHub: {
    getInstance: vi.fn().mockResolvedValue(mockMcpHub),
    initialize: vi.fn().mockReturnValue(mockMcpHub),
  }
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockImplementation((path) => {
    // Default config for most tests
    return Promise.resolve(JSON.stringify({
      mcpServers: {
        'test-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      },
    }));
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

describe('McpServerManager', () => {
  let provider: ApplicationProvider;
  let consoleSpy: ReturnType<typeof setupConsoleSpy>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a new provider for each test
    provider = new MockApplicationProvider();
    consoleSpy = setupConsoleSpy();
    
    // Reset static properties
    McpServerManager['instance'] = null;
    McpServerManager['providers'] = new Set();
    McpServerManager['initializationPromise'] = null;
    McpServerManager['refCount'] = 0;
    McpServerManager['configWatcher'] = null;
    McpServerManager['initialized'] = false;
  });

  afterEach(async () => {
    // Clean up after each test
    await McpServerManager.cleanup();
  });

  describe('Singleton Pattern', () => {
    it('should register the provider when getInstance is called', async () => {
      await McpServerManager.getInstance(provider);
      
      expect(McpServerManager['providers'].size).toBe(1);
      expect(McpServerManager['providers'].has(provider)).toBe(true);
      expect(McpServerManager['refCount']).toBe(1);
    });

    it('should create a new instance when getInstance is called for the first time', async () => {
      const instance = await McpServerManager.getInstance(provider);
      
      expect(instance).toBe(mockMcpHub);
      expect(McpHub.getInstance).toHaveBeenCalledWith(provider);
    });

    it('should return the same instance when getInstance is called multiple times', async () => {
      const instance1 = await McpServerManager.getInstance(provider);
      
      // Reset the mock to verify it's not called again
      (McpHub.getInstance as any).mockClear();
      
      const instance2 = await McpServerManager.getInstance(provider);
      
      expect(instance1).toBe(instance2);
      expect(McpHub.getInstance).not.toHaveBeenCalled();
    });

    it('should initialize the manager when getInstance is called for the first time', async () => {
      // Spy on the initialize method
      const initializeSpy = vi.spyOn(McpServerManager, 'initialize');
      
      await McpServerManager.getInstance(provider);
      
      expect(initializeSpy).toHaveBeenCalledWith(provider);
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration from the config file', async () => {
      await McpServerManager.getInstance(provider);
      
      // Verify that updateServerConnections was called with the correct arguments
      expect(mockMcpHub.updateServerConnections).toHaveBeenCalledWith({
        'test-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      }, 'global');
    });

    it('should handle missing configuration file', async () => {
      // Mock fileExistsAtPath to return false
      vi.spyOn(provider, 'fileExistsAtPath').mockResolvedValueOnce(false);
      
      await McpServerManager.getInstance(provider);
      
      // Verify that updateServerConnections was not called
      expect(mockMcpHub.updateServerConnections).not.toHaveBeenCalled();
    });

    it('should handle invalid configuration file', async () => {
      // Mock readFile to return invalid JSON for this specific test
      (fs.readFile as any).mockResolvedValueOnce('invalid json');
      
      await McpServerManager.getInstance(provider);
      
      // Verify that updateServerConnections was not called
      expect(mockMcpHub.updateServerConnections).not.toHaveBeenCalled();
    });

    it('should set up a watcher for the configuration file', async () => {
      await McpServerManager.getInstance(provider);
      
      // Verify that watch was called with the correct arguments
      expect(fsSync.watch).toHaveBeenCalledWith(
        McpServerManager['configPath'],
        expect.any(Function)
      );
    });

    it('should reload configuration when the file changes', async () => {
      await McpServerManager.getInstance(provider);
      
      // Reset the mock to verify it's called again
      mockMcpHub.updateServerConnections.mockClear();
      
      // Mock readFile to return a different configuration for this specific test
      (fs.readFile as any).mockResolvedValueOnce(JSON.stringify({
        mcpServers: {
          'test-server-2': {
            type: 'sse',
            url: 'http://localhost:3000/mcp',
          },
        },
      }));
      
      // Simulate a file change event
      const watchCallback = (fsSync.watch as any).mock.calls[0][1];
      await watchCallback('change');
      
      // Verify that updateServerConnections was called with the new configuration
      expect(mockMcpHub.updateServerConnections).toHaveBeenCalledWith({
        'test-server-2': {
          type: 'sse',
          url: 'http://localhost:3000/mcp',
        },
      }, 'global');
    });
  });

  describe('Server Management', () => {
    it('should connect to a server', async () => {
      await McpServerManager.getInstance(provider);
      
      // Reset the mock to verify it's called again
      mockMcpHub.connectToServer.mockClear();
      
      // Connect to the server
      const result = await McpServerManager.connectServer('test-server', provider);
      
      expect(result).toBe(true);
      expect(mockMcpHub.connectToServer).toHaveBeenCalledWith(
        'test-server',
        {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        'global'
      );
    });

    it('should handle connecting to a non-existent server', async () => {
      // Mock readFile to return a specific configuration
      (fs.readFile as any).mockResolvedValueOnce(JSON.stringify({
        mcpServers: {
          'test-server': {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
          },
        },
      }));
      
      await McpServerManager.getInstance(provider);
      
      // Reset the mock to verify it's not called
      mockMcpHub.connectToServer.mockClear();
      
      // Connect to a non-existent server
      const result = await McpServerManager.connectServer('non-existent-server', provider);
      
      expect(result).toBe(false);
      expect(mockMcpHub.connectToServer).not.toHaveBeenCalled();
    });

    it('should disconnect from a server', async () => {
      await McpServerManager.getInstance(provider);
      
      // Disconnect from the server
      const result = await McpServerManager.disconnectServer('test-server', provider);
      
      expect(result).toBe(true);
      expect(mockMcpHub.deleteConnection).toHaveBeenCalledWith('test-server', 'global');
    });
  });

  describe('Capability Access', () => {
    it('should get connected servers', async () => {
      await McpServerManager.getInstance(provider);
      
      // Mock getServers to return a specific value
      mockMcpHub.getServers.mockReturnValueOnce([
        { name: 'test-server', status: 'connected' },
      ]);
      
      const servers = await McpServerManager.getConnectedServers();
      
      expect(servers).toEqual([
        { name: 'test-server', status: 'connected' },
      ]);
    });

    it('should get server capabilities', async () => {
      await McpServerManager.getInstance(provider);
      
      // Mock getToolsList and getResourcesList to return specific values
      mockMcpHub.getToolsList.mockResolvedValueOnce([
        { id: 'tool1', name: 'Tool 1' },
      ]);
      mockMcpHub.getResourcesList.mockResolvedValueOnce([
        { uri: 'resource1', name: 'Resource 1' },
      ]);
      
      const capabilities = await McpServerManager.getServerCapabilities('test-server');
      
      expect(capabilities).toEqual({
        tools: [{ id: 'tool1', name: 'Tool 1' }],
        resources: [{ uri: 'resource1', name: 'Resource 1' }],
      });
    });

    it('should execute a tool', async () => {
      await McpServerManager.getInstance(provider);
      
      // Mock executeTool to return a specific value
      mockMcpHub.executeTool.mockResolvedValueOnce({
        result: 'success',
      });
      
      const response = await McpServerManager.executeTool(
        'test-server',
        'tool1',
        { param: 'value' }
      );
      
      expect(response).toEqual({
        result: 'success',
      });
      expect(mockMcpHub.executeTool).toHaveBeenCalledWith(
        'test-server',
        'tool1',
        { param: 'value' }
      );
    });

    it('should access a resource', async () => {
      await McpServerManager.getInstance(provider);
      
      // Mock accessResource to return a specific value
      mockMcpHub.accessResource.mockResolvedValueOnce({
        content: 'resource content',
      });
      
      const response = await McpServerManager.accessResource(
        'test-server',
        'resource1'
      );
      
      expect(response).toEqual({
        content: 'resource content',
      });
      expect(mockMcpHub.accessResource).toHaveBeenCalledWith(
        'test-server',
        'resource1'
      );
    });
  });

  describe('Cleanup', () => {
    it('should unregister a provider', async () => {
      await McpServerManager.getInstance(provider);
      
      await McpServerManager.unregisterProvider(provider);
      
      expect(McpServerManager['providers'].size).toBe(0);
      expect(McpServerManager['refCount']).toBe(0);
    });

    it('should clean up when the last provider is unregistered', async () => {
      await McpServerManager.getInstance(provider);
      
      await McpServerManager.unregisterProvider(provider);
      
      expect(mockMcpHub.dispose).toHaveBeenCalled();
      expect(McpServerManager['instance']).toBeNull();
      expect(McpServerManager['configWatcher']).toBeNull();
      expect(McpServerManager['initialized']).toBe(false);
    });

    it('should not clean up when there are still providers registered', async () => {
      await McpServerManager.getInstance(provider);
      
      // Register another provider
      const provider2 = new MockApplicationProvider();
      await McpServerManager.getInstance(provider2);
      
      // Unregister the first provider
      await McpServerManager.unregisterProvider(provider);
      
      expect(mockMcpHub.dispose).not.toHaveBeenCalled();
      expect(McpServerManager['providers'].size).toBe(1);
      expect(McpServerManager['refCount']).toBe(1);
    });
  });
});