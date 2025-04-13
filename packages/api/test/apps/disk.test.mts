// packages/api/test/apps/disk.test.mts
import { vi } from 'vitest';

// Mock disk module - must be defined before the variable is imported
vi.mock('../../apps/disk.mjs', async (importOriginal) => {
  const originalModule = await importOriginal() as any;
  
  // Create a modified version of the original module with inline spy definitions
  return {
    ...originalModule,
    // Replace writeFile with an inline-created spy
    writeFile: vi.fn().mockResolvedValue(undefined),
    // Mock loadFile
    loadFile: vi.fn().mockImplementation((filePath: string) => {
      const fileContents: Record<string, string> = {
        'src/App.tsx': 'Original App.tsx content',
        'src/config.json': '{"apiUrl": "https://example.com", "apiKey": "old-key"}'
      };
      
      if (fileContents[filePath]) {
        return Promise.resolve({ source: fileContents[filePath] });
      }
      return Promise.reject(new Error(`File not found: ${filePath}`));
    })
  };
});

// Mock fs
vi.mock("node:fs/promises", async (importOriginal) => {
  const originalModule = await importOriginal() as any;
  return {
    ...originalModule,
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
    rm: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock McpServerManager
vi.mock('../../mcp/McpServerManager.mjs', () => ({
  McpServerManager: {
    getInstance: vi.fn().mockResolvedValue({
      getServers: vi.fn().mockReturnValue([{ name: 'supabase', status: 'connected' }]),
      callTool: vi.fn().mockImplementation((toolId: string) => {
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
      })
    }),
    cleanup: vi.fn().mockResolvedValue(undefined)
  }
}));

import { expect, test, describe, beforeEach } from 'vitest';
import { parsePlan } from '../../ai/plan-parser.mjs';
import * as diskModule from '../../apps/disk.mjs';
import { applyPlan } from '../../apps/disk.mjs';
import { McpServerManager } from '../../mcp/McpServerManager.mjs';
import type { App } from '../../db/schema.mjs';
import type { McpToolAction } from '../../ai/plan-parser.mjs';
import { MockApplicationProvider, createMockApp } from '../test-helpers.mjs';

describe('MCP Integration with File Actions', () => {
  let mockApp: App;
  let provider: MockApplicationProvider;

  
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    provider = new MockApplicationProvider();
  });
  
  test('Mixed file and Supabase MCP action', async () => {
    const xmlPlan = `
    <plan>
      <planDescription>Update app with Supabase integration</planDescription>
      <action type="file">
        <description>Update App.tsx with Supabase info</description>
        <file filename="src/App.tsx">
          <![CDATA[
          import React from 'react';
          
          function App() {
            return <div>Supabase Connected</div>;
          }
          
          export default App;
          ]]>
        </file>
      </action>
      <action type="mcpTool">
        <description>Execute SQL query in Supabase</description>
        <serverName>supabase</serverName>
        <toolId>execute_sql</toolId>
        <arguments>
          <![CDATA[
          {
            "project_id": "project123",
            "query": "INSERT INTO test_data (name, content) VALUES ('Test Entry', 'This was added via MCP') RETURNING *"
          }
          ]]>
        </arguments>
      </action>
      <action type="mcpTool">
        <description>List tables in the Supabase project</description>
        <serverName>supabase</serverName>
        <toolId>list_tables</toolId>
        <arguments>
          <![CDATA[
          {
            "project_id": "project123"
          }
          ]]>
        </arguments>
      </action>
    </plan>
    `;
    
    // Parse the plan
    const plan = await parsePlan(xmlPlan, mockApp, 'update with supabase', 'test-plan-id');
    
    // Verify the plan was parsed correctly
    expect(plan.actions).toHaveLength(3);
    expect(plan.actions[0]?.type).toBe('file');
    expect(plan.actions[1]?.type).toBe('mcpTool');
    
    const mcpAction1 = plan.actions[1] as McpToolAction;
    expect(mcpAction1.toolId).toBe('execute_sql');
    
    expect(plan.actions[2]?.type).toBe('mcpTool');
    const mcpAction2 = plan.actions[2] as McpToolAction;
    expect(mcpAction2.toolId).toBe('list_tables');
    
    // Apply the plan
    const result = await applyPlan(mockApp, plan, provider);
    
    // Verify the result
    expect(result.fileActionsProcessed).toBe(1);
    expect(result.mcpToolActionsProcessed).toBe(2);
    expect(result.errors).toBe(0);
    
    // Verify writeFile was called for the file action
    expect(diskModule.writeFile).toHaveBeenCalledTimes(1);
    
    // Verify McpServerManager.callTool was called for the MCP actions
    const mcpServerManager = await McpServerManager.getInstance(provider);
    expect(mcpServerManager.callTool).toHaveBeenCalledTimes(2);
    
    // Check first MCP tool call (execute_sql)
    expect(mcpServerManager.callTool).toHaveBeenCalledWith(
      'supabase',
      'execute_sql',
      expect.objectContaining({ 
        project_id: 'project123',
        query: expect.stringContaining('INSERT INTO test_data')
      })
    );
    
    // Check second MCP tool call (list_tables)
    expect(mcpServerManager.callTool).toHaveBeenCalledWith(
      'supabase',
      'list_tables',
      expect.objectContaining({
        project_id: 'project123'
      })
    );
  });
});