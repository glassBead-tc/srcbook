import { vi } from 'vitest';
import type { App as DBAppType } from '../db/schema.mjs';
import type { ApplicationProvider } from '../mcp/ApplicationProvider.mjs';

/**
 * Standard mock for fs/promises module
 * Usage: vi.mock('fs/promises', () => mockFs());
 */
export function mockFs(customImplementation = {}) {
  return {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path.includes('srcbook_mcp_config.json') || path.includes('mcp-settings.json')) {
        return Promise.resolve(JSON.stringify({
          mcpServers: {
            'supabase': {
              command: 'npx',
              args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', 'sbp_example_token']
            }
          }
        }));
      }
      return Promise.reject(new Error(`Mock file not found: ${path}`));
    }),
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
    rm: vi.fn().mockResolvedValue(undefined),
    ...customImplementation
  };
}

/**
 * Standard mock for fs module (non-promises)
 * Usage: vi.mock('fs', () => mockFsSync());
 */
export function mockFsSync(customImplementation = {}) {
  return {
    watch: vi.fn().mockReturnValue({
      close: vi.fn(),
    }),
    ...customImplementation
  };
}

/**
 * Standard mock for disk.mjs module
 * Usage: vi.mock('../../apps/disk.mjs', () => mockDiskModule());
 */
export function mockDiskModule(customImplementation = {}) {
  return async () => {
    const originalModule = await vi.importActual('../../apps/disk.mjs');
    return {
      ...originalModule,
      loadFile: vi.fn().mockImplementation((app: DBAppType, filePath: string) => {
        const fileContents: Record<string, string> = {
          'src/App.tsx': 'Original App.tsx content',
          'src/config.json': '{"apiUrl": "https://example.com", "apiKey": "old-key"}'
        };
        
        if (fileContents[filePath]) {
          return Promise.resolve({ source: fileContents[filePath] });
        }
        return Promise.reject(new Error(`File not found: ${filePath}`));
      }),
      writeFile: vi.fn().mockImplementation((app: DBAppType, file: any) => {
        return Promise.resolve();
      }),
      ...customImplementation
    };
  };
}

/**
 * Standard mock for McpHub module
 * Usage: vi.mock('../../mcp/McpHub.mjs', () => mockMcpHub());
 */
export function mockMcpHub(customImplementation = {}) {
  return {
    McpHub: {
      getInstance: vi.fn(),
      initialize: vi.fn(),
      instance: null,
      updateServerConnections: vi.fn().mockResolvedValue(undefined),
      connectToServer: vi.fn().mockResolvedValue(undefined),
      deleteConnection: vi.fn().mockResolvedValue(undefined),
      getServers: vi.fn().mockReturnValue([]),
      getToolsList: vi.fn().mockResolvedValue([]),
      getResourcesList: vi.fn().mockResolvedValue([]),
      executeTool: vi.fn().mockResolvedValue({ result: 'success' }),
      accessResource: vi.fn().mockResolvedValue({ content: 'resource content' }),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...customImplementation
    }
  };
}

/**
 * Standard mock for McpServerManager module
 * Usage: vi.mock('../../mcp/McpServerManager.mjs', () => mockMcpServerManager());
 */
export function mockMcpServerManager(customImplementation = {}) {
  return {
    McpServerManager: {
      getInstance: vi.fn().mockResolvedValue({
        getServers: vi.fn().mockReturnValue([{ name: 'supabase', status: 'connected' }]),
        callTool: vi.fn().mockImplementation((serverName: string, toolId: string, args: any) => {
          if (toolId === 'list_projects') {
            return Promise.resolve({
              result: {
                success: true,
                data: [
                  { id: 'project123', name: 'Test Project', organization_id: 'org456' }
                ]
              }
            });
          } else if (toolId === 'execute_sql') {
            return Promise.resolve({
              result: {
                success: true,
                data: [{ id: 1, name: 'Test Entry', content: 'Test data' }]
              }
            });
          }
          return Promise.resolve({
            result: { success: true, data: "Operation completed successfully" }
          });
        }),
        ...customImplementation
      }),
      cleanup: vi.fn().mockResolvedValue(undefined)
    }
  };
}

/**
 * Mock application provider for MCP-related tests
 */
export class MockApplicationProvider implements ApplicationProvider {
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

/**
 * Create a mock app for testing
 */
export function createMockApp(customProps = {}): DBAppType {
  return {
    id: 1,
    externalId: 'test-app',
    name: 'Test App',
    history: '[]',
    historyVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...customProps
  };
}

/**
 * Setup console spies for testing
 */
export function setupConsoleSpy() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {})
  };
} 