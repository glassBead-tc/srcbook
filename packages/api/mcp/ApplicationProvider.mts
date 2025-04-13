/**
 * ApplicationProvider interface and implementation for the MCP client.
 * This module defines the interface for providing application-specific functionality
 * to the MCP client, such as accessing application settings, file system, etc.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Interface for providing application-specific functionality to the MCP client.
 */
export interface ApplicationProvider {
  /**
   * Get the application name.
   */
  getApplicationName(): string;

  /**
   * Get the application version.
   */
  getApplicationVersion(): string;

  /**
   * Ensure a directory exists, creating it if necessary.
   * @param dirPath The directory path to ensure exists
   * @returns The absolute path to the directory
   */
  ensureDirectoryExists(dirPath: string): Promise<string>;

  /**
   * Get the path to the MCP servers directory.
   * @returns The absolute path to the MCP servers directory
   */
  getMcpServersPath(): Promise<string>;

  /**
   * Get the path to the MCP settings file.
   * @returns The absolute path to the MCP settings file
   */
  getMcpSettingsFilePath(): Promise<string>;

  /**
   * Check if a file exists at the specified path.
   * @param filePath The path to check
   * @returns True if the file exists, false otherwise
   */
  fileExistsAtPath(filePath: string): Promise<boolean>;

  /**
   * Post a message to the application UI.
   * @param message The message to post
   */
  postMessageToUi(message: any): Promise<void>;

  /**
   * Log a message to the application's logging system.
   * @param message The message to log
   */
  log(message: string): void;
}

/**
 * Default implementation of the ApplicationProvider interface.
 * This implementation provides basic functionality that can be extended
 * or replaced by specific applications.
 */
export class DefaultApplicationProvider implements ApplicationProvider {
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly baseDir: string;

  /**
   * Create a new DefaultApplicationProvider.
   * @param appName The application name
   * @param appVersion The application version
   * @param baseDir The base directory for application data
   */
  constructor(appName: string, appVersion: string, baseDir: string) {
    this.appName = appName;
    this.appVersion = appVersion;
    this.baseDir = baseDir;
  }

  /**
   * Get the application name.
   */
  getApplicationName(): string {
    return this.appName;
  }

  /**
   * Get the application version.
   */
  getApplicationVersion(): string {
    return this.appVersion;
  }

  /**
   * Ensure a directory exists, creating it if necessary.
   * @param dirPath The directory path to ensure exists
   * @returns The absolute path to the directory
   */
  async ensureDirectoryExists(dirPath: string): Promise<string> {
    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(this.baseDir, dirPath);

    try {
      await fs.mkdir(absolutePath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    return absolutePath;
  }

  /**
   * Get the path to the MCP servers directory.
   * @returns The absolute path to the MCP servers directory
   */
  async getMcpServersPath(): Promise<string> {
    const mcpServersPath = path.join(this.baseDir, 'mcp-servers');
    return this.ensureDirectoryExists(mcpServersPath);
  }

  /**
   * Get the path to the MCP settings file.
   * @returns The absolute path to the MCP settings file
   */
  async getMcpSettingsFilePath(): Promise<string> {
    const settingsDir = path.join(this.baseDir, 'settings');
    await this.ensureDirectoryExists(settingsDir);
    
    const mcpSettingsFilePath = path.join(settingsDir, 'mcp-settings.json');
    
    const fileExists = await this.fileExistsAtPath(mcpSettingsFilePath);
    if (!fileExists) {
      // Create default settings file if it doesn't exist
      await fs.writeFile(
        mcpSettingsFilePath,
        JSON.stringify({
          mcpServers: {}
        }, null, 2)
      );
    }
    
    return mcpSettingsFilePath;
  }

  /**
   * Check if a file exists at the specified path.
   * @param filePath The path to check
   * @returns True if the file exists, false otherwise
   */
  async fileExistsAtPath(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Post a message to the application UI.
   * This default implementation just logs the message.
   * Applications should override this method to provide actual UI integration.
   * @param message The message to post
   */
  async postMessageToUi(message: any): Promise<void> {
    this.log(`UI Message: ${JSON.stringify(message)}`);
    // Default implementation does nothing with UI
    // Specific applications should override this
  }

  /**
   * Log a message to the application's logging system.
   * @param message The message to log
   */
  log(message: string): void {
    console.log(`[${this.appName} MCP] ${message}`);
  }
}

/**
 * TODO: Add more application-specific functionality as needed.
 */