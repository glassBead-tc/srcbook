import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationProvider } from '../../mcp/ApplicationProvider.mjs';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

// Create a concrete implementation of ApplicationProvider for testing
class TestApplicationProvider implements ApplicationProvider {
  private appName: string;
  private appVersion: string;
  private basePath: string;
  private logMessages: string[] = [];

  constructor(appName: string = 'test-app', appVersion: string = '1.0.0', basePath: string = '/test/path') {
    this.appName = appName;
    this.appVersion = appVersion;
    this.basePath = basePath;
  }

  getApplicationName(): string {
    return this.appName;
  }

  getApplicationVersion(): string {
    return this.appVersion;
  }

  async ensureDirectoryExists(dirPath: string): Promise<string> {
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  async getMcpServersPath(): Promise<string> {
    const serversPath = path.join(this.basePath, 'mcp-servers');
    await this.ensureDirectoryExists(serversPath);
    return serversPath;
  }

  async getMcpSettingsFilePath(): Promise<string> {
    const settingsDir = path.join(this.basePath, 'settings');
    await this.ensureDirectoryExists(settingsDir);
    return path.join(settingsDir, 'mcp-settings.json');
  }

  async fileExistsAtPath(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async postMessageToUi(message: any): Promise<void> {
    // In a real implementation, this would post a message to the UI
    // For testing, we'll just log it
    this.logMessages.push(JSON.stringify(message));
  }

  log(message: string): void {
    this.logMessages.push(message);
  }

  // Helper method for testing
  getLogMessages(): string[] {
    return this.logMessages;
  }
}

describe('ApplicationProvider', () => {
  let provider: TestApplicationProvider;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a new provider for each test
    provider = new TestApplicationProvider();
  });

  describe('Application Information', () => {
    it('should return the application name', () => {
      expect(provider.getApplicationName()).toBe('test-app');
    });

    it('should return the application version', () => {
      expect(provider.getApplicationVersion()).toBe('1.0.0');
    });

    it('should allow custom application name and version', () => {
      const customProvider = new TestApplicationProvider('custom-app', '2.0.0');
      expect(customProvider.getApplicationName()).toBe('custom-app');
      expect(customProvider.getApplicationVersion()).toBe('2.0.0');
    });
  });

  describe('Directory Management', () => {
    it('should ensure a directory exists', async () => {
      const dirPath = '/test/dir';
      await provider.ensureDirectoryExists(dirPath);
      
      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should return the MCP servers path', async () => {
      const serversPath = await provider.getMcpServersPath();
      
      expect(serversPath).toBe('/test/path/mcp-servers');
      expect(fs.mkdir).toHaveBeenCalledWith('/test/path/mcp-servers', { recursive: true });
    });

    it('should return the MCP settings file path', async () => {
      const settingsPath = await provider.getMcpSettingsFilePath();
      
      expect(settingsPath).toBe('/test/path/settings/mcp-settings.json');
      expect(fs.mkdir).toHaveBeenCalledWith('/test/path/settings', { recursive: true });
    });
  });

  describe('File Operations', () => {
    it('should check if a file exists', async () => {
      // Mock fs.access to return success
      (fs.access as any).mockResolvedValueOnce(undefined);
      
      const exists = await provider.fileExistsAtPath('/test/file.txt');
      
      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should handle non-existent files', async () => {
      // Mock fs.access to throw an error
      (fs.access as any).mockRejectedValueOnce(new Error('File not found'));
      
      const exists = await provider.fileExistsAtPath('/test/non-existent.txt');
      
      expect(exists).toBe(false);
      expect(fs.access).toHaveBeenCalledWith('/test/non-existent.txt');
    });
  });

  describe('Logging and UI Communication', () => {
    it('should log messages', () => {
      provider.log('Test message');
      
      expect(provider.getLogMessages()).toContain('Test message');
    });

    it('should post messages to the UI', async () => {
      await provider.postMessageToUi({ type: 'test', data: 'message' });
      
      expect(provider.getLogMessages()).toContain(JSON.stringify({ type: 'test', data: 'message' }));
    });
  });
});