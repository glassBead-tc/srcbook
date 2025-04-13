// packages/api/test/plan-parser-enhanced.test.mts
import { expect, test, describe } from 'vitest';
import { parsePlan, executeMcpToolActions } from '../../ai/plan-parser.mjs';
import { type App as DBAppType } from '../../db/schema.mjs';
import { vi } from 'vitest';
import { McpServerManager, ApplicationProvider } from '../../mcp/index.mjs';

// Mock data for GitHub issue search response
const mockGitHubIssues = [
  { 
    number: 42, 
    title: "Add feature X", 
    body: "We need to implement feature X",
    state: "open",
    html_url: "https://github.com/user/repo/issues/42"
  }
];

// Mock the fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockImplementation((path, encoding) => {
    if (path.includes('srcbook_mcp_config.json') || path.includes('mcp-settings.json')) {
      return Promise.resolve(JSON.stringify({
        mcpServers: {
          'github': {
            type: 'stdio',
            command: 'npx',
            args: ['@modelcontextprotocol/server-github']
          }
        }
      }));
    }
    return Promise.reject(new Error(`Mock file not found: ${path}`));
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined)
}));

// Mock the loadFile function with EXACT paths that match what the parser uses
vi.mock('../../apps/disk.mjs', () => ({
  loadFile: vi.fn().mockImplementation((_app, filePath) => {
    if (filePath === 'src/App.tsx') {
      return Promise.resolve({ source: 'Original App.tsx content' });
    } else if (filePath === 'src/config.json') {
      return Promise.resolve({ source: '{"githubRepo": "user/repo", "apiKey": "old-key"}' });
    }
    console.warn(`Mock file not found: ${filePath}`);
    return Promise.reject(new Error('File not found'));
  }),
}));

// Mock the McpServerManager with better implementation
vi.mock('../../mcp/McpServerManager.mjs', () => ({
  McpServerManager: {
    getInstance: vi.fn().mockResolvedValue({
      getServers: vi.fn().mockReturnValue([
        { name: 'github', status: 'connected' }
      ]),
      callTool: vi.fn().mockImplementation((serverName, toolId, args) => {
        if (serverName === 'github' && toolId === 'searchIssues') {
          return Promise.resolve({ 
            result: {
              issues: mockGitHubIssues
            } 
          });
        }
        return Promise.resolve({ error: 'Server or tool not found', result: null });
      }),
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadConfiguration: vi.fn().mockResolvedValue({
      mcpServers: {
        'github': {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-github']
        }
      }
    })
  }
}));

// Mock the McpHub module (not directly used but may be imported)
vi.mock('../../mcp/McpHub.mjs', () => ({
  McpHub: {
    getInstance: vi.fn().mockResolvedValue({
      updateServerConnections: vi.fn().mockResolvedValue(undefined),
      connectToServer: vi.fn().mockResolvedValue(undefined),
      getServers: vi.fn().mockReturnValue([{ name: 'github', status: 'connected' }]),
    }),
  }
}));

// Create a mock ApplicationProvider
class MockApplicationProvider implements ApplicationProvider {
  getApplicationName(): string { return 'test-app'; }
  getApplicationVersion(): string { return '1.0.0'; }
  async ensureDirectoryExists(dirPath: string): Promise<string> { return dirPath; }
  async getMcpServersPath(): Promise<string> { return '/test/mcp-servers'; }
  async getMcpSettingsFilePath(): Promise<string> { return '/test/settings/mcp-settings.json'; }
  async fileExistsAtPath(filePath: string): Promise<boolean> { return true; }
  async postMessageToUi(message: any): Promise<void> {}
  log(message: string): void {}
}

const mockApp: DBAppType = {
  id: 123,
  externalId: '123',
  name: 'Test App',
  createdAt: new Date(),
  updatedAt: new Date(),
  history: '',
  historyVersion: 1,
};

// XML response that combines file changes, commands, and MCP tool calls
const mockXMLResponseWithMcpTools = `
<plan>
  <planDescription>Implement feature with GitHub issue search</planDescription>
  <action type="file">
    <description>Update App.tsx with todo list functionality</description>
    <file filename="src/App.tsx">
      <![CDATA[
import React, { useState, useEffect } from 'react';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const storedTodos = localStorage.getItem('todos');
    if (storedTodos) {
      setTodos(JSON.parse(storedTodos));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    if (inputValue.trim() !== '') {
      setTodos([...todos, { id: Date.now(), text: inputValue, completed: false }]);
      setInputValue('');
    }
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Todo List</h1>
      <div className="flex mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-grow p-2 border rounded-l"
          placeholder="Add a new todo"
        />
        <button onClick={addTodo} className="bg-blue-500 text-white p-2 rounded-r">Add</button>
      </div>
      <ul>
        {todos.map(todo => (
          <li key={todo.id} className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
              className="mr-2"
            />
            <span className={todo.completed ? 'line-through' : ''}>{todo.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
      ]]>
    </file>
  </action>
  <action type="file">
    <description>Update config.json with new API key</description>
    <file filename="src/config.json">
      <![CDATA[
{
  "githubRepo": "user/repo",
  "apiKey": "updated-key"
}
      ]]>
    </file>
  </action>
  <action type="command">
    <description>Install required packages</description>
    <commandType>npm install</commandType>
    <package>@types/react</package>
    <package>@types/react-dom</package>
  </action>
  <action type="mcpTool">
    <description>Search GitHub issues for related tasks</description>
    <serverName>github</serverName>
    <toolId>searchIssues</toolId>
    <arguments>
      <![CDATA[
{
  "repo": "user/repo",
  "query": "feature X",
  "state": "open"
}
      ]]>
    </arguments>
  </action>
</plan>
`;

describe('Enhanced Plan Parser Tests', () => {
  let mockProvider: ApplicationProvider;
  let consoleSpy: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a mock provider
    mockProvider = new MockApplicationProvider();
    
    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {})
    };
  });

  test('should correctly parse a plan with file, command, and MCP tool actions', async () => {
    const plan = await parsePlan(mockXMLResponseWithMcpTools, mockApp, 'implement todo list with GitHub integration', '123456');

    expect(plan.id).toBe('123456');
    expect(plan.query).toBe('implement todo list with GitHub integration');
    expect(plan.description).toBe('Implement feature with GitHub issue search');
    expect(plan.actions).toHaveLength(4);

    // Check first file action
    const fileAction1 = plan.actions[0] as any;
    expect(fileAction1.type).toBe('file');
    expect(fileAction1.path).toBe('src/App.tsx');
    expect(fileAction1.modified).toContain('function App()');
    expect(fileAction1.original).toBe('Original App.tsx content');
    expect(fileAction1.description).toBe('Update App.tsx with todo list functionality');

    // Check second file action
    const fileAction2 = plan.actions[1] as any;
    expect(fileAction2.type).toBe('file');
    expect(fileAction2.path).toBe('src/config.json');
    expect(fileAction2.modified).toContain('"apiKey": "updated-key"');
    expect(fileAction2.original).toBe('{"githubRepo": "user/repo", "apiKey": "old-key"}');
    expect(fileAction2.description).toBe('Update config.json with new API key');

    // Check command action
    const commandAction = plan.actions[2] as any;
    expect(commandAction.type).toBe('command');
    expect(commandAction.command).toBe('npm install');
    expect(commandAction.packages).toEqual(['@types/react', '@types/react-dom']);
    expect(commandAction.description).toBe('Install required packages');

    // Check MCP tool action
    const mcpToolAction = plan.actions[3] as any;
    expect(mcpToolAction.type).toBe('mcpTool');
    expect(mcpToolAction.serverName).toBe('github');
    expect(mcpToolAction.toolId).toBe('searchIssues');
    expect(mcpToolAction.arguments).toEqual({
      repo: 'user/repo',
      query: 'feature X',
      state: 'open'
    });
    expect(mcpToolAction.description).toBe('Search GitHub issues for related tasks');
  });

  test('should successfully execute MCP tool actions', async () => {
    const plan = await parsePlan(mockXMLResponseWithMcpTools, mockApp, 'implement todo list with GitHub integration', '123456');
    
    // Execute MCP tool actions
    await executeMcpToolActions(plan, mockProvider);
    
    // Get the mock McpServerManager instance
    const mockMcpServerManager = await McpServerManager.getInstance(mockProvider);
    
    // Verify that callTool was called with the correct parameters
    expect(mockMcpServerManager.callTool).toHaveBeenCalledTimes(1);
    expect(mockMcpServerManager.callTool).toHaveBeenCalledWith(
      'github',
      'searchIssues',
      {
        repo: 'user/repo',
        query: 'feature X',
        state: 'open'
      }
    );
    
    // Verify that success was logged
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('Successfully executed MCP tool')
    );
  });
});