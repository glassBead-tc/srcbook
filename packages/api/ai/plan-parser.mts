import { XMLParser } from 'fast-xml-parser';
import Path from 'node:path';
import { type App as DBAppType } from '../db/schema.mjs';
import { loadFile } from '../apps/disk.mjs';
import { StreamingXMLParser, TagType } from './stream-xml-parser.mjs';
import {
  ActionChunkType,
  DescriptionChunkType,
  FileActionChunkType,
  CommandActionChunkType,
  McpToolActionChunkType
} from '../../shared/src/types/history.mjs';
import { McpServerManager, McpHub } from '../mcp/index.mjs';
import { McpServer } from '../mcp/types.mjs';

// The ai proposes a plan that we expect to contain both files and commands
// Here is an example of a plan:

/*
 * Example of a plan:
 *
 * <plan>
 *   <action type="file">
 *     <description>{Short justification of changes. Be as brief as possible, like a commit message}</description>
 *     <file filename="package.json">
 *         <![CDATA[{entire file contents}]]]]>
 *     </file>
 *   </action>
 *   <action type="file">
 *     <description>
 *         <![CDATA[{Short description of changes}]]>
 *     </description>
 *     <file filename="./App.tsx">
 *       <![CDATA[
 *         {... file contents (ALL OF THE FILE)}
 *       ]]>
 *     </file>
 *   </action>
 *
 *  <action type="command">
 *    <description>
 *      <![CDATA[
 *        Install required packages for state management and routing
 *      ]]>
 *    </description>
 *    <commandType>npm install</commandType>
 *    <package>react-redux</package>
 *    <package>react-router-dom</package>
 *  </action>
 *   ...
 * </plan>
 */

interface FileAction {
  type: 'file';
  dirname: string;
  basename: string;
  path: string;
  modified: string;
  original: string | null; // null if this is a new file. Consider using an enum for 'edit' | 'create' | 'delete' instead.
  description: string;
}

type NpmInstallCommand = {
  type: 'command';
  command: 'npm install';
  packages: string[];
  description: string;
};

/**
 * Represents an MCP tool action that can be executed by the McpHub.
 */
type McpToolAction = {
  type: 'mcpTool';
  serverName: string;
  toolId: string;
  arguments: Record<string, any>;
  description: string;
};

// Later we can add more commands. For now, we only support npm install
type Command = NpmInstallCommand;

export interface Plan {
  // The high level description of the plan
  // Will be shown to the user above the diff box.
  id: string;
  query: string;
  description: string;
  actions: (FileAction | Command | McpToolAction)[];
}



interface ParsedResult {
  plan: {
    planDescription: string;
    action:
      | {
          '@_type': string;
          description: string;
          file?: { '@_filename': string; '#text': string };
          commandType?: string;
          package?: string | string[];
          // MCP tool fields
          serverName?: string;
          toolId?: string;
          arguments?: string | Record<string, any>;
        }[]
      | {
          '@_type': string;
          description: string;
          file?: { '@_filename': string; '#text': string };
          commandType?: string;
          package?: string | string[];
          // MCP tool fields
          serverName?: string;
          toolId?: string;
          arguments?: string | Record<string, any>;
        };
  };
}

export async function parsePlan(
  response: string,
  app: DBAppType,
  query: string,
  planId: string,
): Promise<Plan> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const result = parser.parse(response) as ParsedResult;

    if (!result.plan) {
      throw new Error('Invalid response: missing plan tag');
    }

    const plan: Plan = {
      id: planId,
      query,
      actions: [],
      description: result.plan.planDescription,
    };
    const actions = Array.isArray(result.plan.action) ? result.plan.action : [result.plan.action];

    for (const action of actions) {
      if (action['@_type'] === 'file' && action.file) {
        const filePath = action.file['@_filename'];
        let originalContent = null;

        try {
          const fileContent = await loadFile(app, filePath);
          originalContent = fileContent.source;
        } catch (error) {
          // If the file doesn't exist, it's likely that it's a new file.
        }

        plan.actions.push({
          type: 'file',
          path: filePath,
          dirname: Path.dirname(filePath),
          basename: Path.basename(filePath),
          modified: action.file['#text'],
          original: originalContent,
          description: action.description,
        });
      } else if (action['@_type'] === 'command' && action.commandType === 'npm install') {
        if (!action.package) {
          console.error('Invalid response: missing package tag');
          continue;
        }
        plan.actions.push({
          type: 'command',
          command: 'npm install',
          packages: Array.isArray(action.package) ? action.package : [action.package],
          description: action.description,
        });
      } else if (action['@_type'] === 'mcpTool') {
        // Handle MCP tool action
        const serverName = action.serverName;
        const toolId = action.toolId;
        const args = action.arguments;
        
        if (!serverName || !toolId) {
          console.error('Invalid MCP tool action: missing serverName or toolId');
          continue;
        }
        
        // Parse arguments as JSON if it's a string
        let parsedArgs: Record<string, any> = {};
        if (args) {
          if (typeof args === 'string') {
            try {
              parsedArgs = JSON.parse(args);
            } catch (error) {
              console.error('Failed to parse MCP tool arguments:', error);
            }
          } else {
            parsedArgs = args;
          }
        }
        
        plan.actions.push({
          type: 'mcpTool',
          serverName,
          toolId,
          arguments: parsedArgs,
          description: action.description,
        });
      }
    }

    return plan;
  } catch (error) {
    console.error('Error parsing XML:', error);
    throw new Error('Failed to parse XML response');
  }
}
export function getPackagesToInstall(plan: Plan): string[] {
  return plan.actions
    .filter(
      (action): action is NpmInstallCommand =>
        action.type === 'command' && action.command === 'npm install',
    )
    .flatMap((action) => action.packages);
}

/**
 * Executes all MCP tool actions in a plan.
 *
 * @param plan The plan containing MCP tool actions to execute
 * @returns A Promise that resolves when all MCP tool actions have been executed
 */
export async function executeMcpToolActions(plan: Plan): Promise<void> {
  // Get all MCP tool actions from the plan
  const mcpToolActions = plan.actions.filter(
    (action): action is McpToolAction => action.type === 'mcpTool'
  );
  
  if (mcpToolActions.length === 0) {
    return;
  }
  
  // Get the McpHub instance
  const mcpHub = McpHub.getInstance(McpServerManager.getApplicationProvider());
  
  // Execute each MCP tool action
  for (const action of mcpToolActions) {
    try {
      // Check if the server is connected
      const servers = mcpHub.getServers();
      const serverExists = servers.some((server: McpServer) => server.name === action.serverName);
      
      if (!serverExists) {
        console.error(`MCP server '${action.serverName}' is not connected`);
        continue;
      }
      
      // Call the tool
      const response = await mcpHub.callTool(
        action.serverName,
        action.toolId,
        action.arguments
      );
      
      // Log the result
      if (response.error) {
        console.error(`Error executing MCP tool '${action.toolId}' on server '${action.serverName}': ${response.error}`);
      } else {
        console.log(`Successfully executed MCP tool '${action.toolId}' on server '${action.serverName}'`);
      }
    } catch (error) {
      console.error(`Failed to execute MCP tool '${action.toolId}' on server '${action.serverName}':`, error);
    }
  }
}

export async function streamParsePlan(
  stream: AsyncIterable<string>,
  app: DBAppType,
  _query: string,
  planId: string,
) {
  let parser: StreamingXMLParser;
  const parsePromises: Promise<void>[] = [];

  return new ReadableStream({
    async pull(controller) {
      if (parser === undefined) {
        parser = new StreamingXMLParser({
          async onTag(tag) {
            if (tag.name === 'planDescription' || tag.name === 'action') {
              const promise = (async () => {
                const chunk = await toStreamingChunk(app, tag, planId);
                if (chunk) {
                  controller.enqueue(JSON.stringify(chunk) + '\n');
                }
              })();
              parsePromises.push(promise);
            }
          },
        });
      }

      try {
        for await (const chunk of stream) {
          parser.parse(chunk);
        }
        // Wait for all pending parse operations to complete before closing
        await Promise.all(parsePromises);
        controller.close();
      } catch (error) {
        console.error(error);
        controller.enqueue(
          JSON.stringify({
            type: 'error',
            data: { content: 'Error while parsing streaming response' },
          }) + '\n',
        );
        controller.error(error);
      }
    },
  });
}

/**
 * Converts a parsed XML tag into a streaming chunk for the client.
 *
 * @param app The database app object
 * @param tag The parsed XML tag
 * @param planId The ID of the current plan
 * @returns A description or action chunk, or null if the tag is not recognized
 */
async function toStreamingChunk(
  app: DBAppType,
  tag: TagType,
  planId: string,
): Promise<DescriptionChunkType | ActionChunkType | null> {
  switch (tag.name) {
    case 'planDescription':
      return {
        type: 'description',
        planId: planId,
        data: { content: tag.content },
      } as DescriptionChunkType;
    case 'action': {
      const descriptionTag = tag.children.find((t) => t.name === 'description');
      const description = descriptionTag?.content ?? '';
      const type = tag.attributes.type;

      if (type === 'file') {
        const fileTag = tag.children.find((t) => t.name === 'file')!;

        const filePath = fileTag.attributes.filename as string;
        let originalContent = null;

        try {
          const fileContent = await loadFile(app, filePath);
          originalContent = fileContent.source;
        } catch (error) {
          // If the file doesn't exist, it's likely that it's a new file.
        }

        return {
          type: 'action',
          planId: planId,
          data: {
            type: 'file',
            description,
            path: filePath,
            dirname: Path.dirname(filePath),
            basename: Path.basename(filePath),
            modified: fileTag.content,
            original: originalContent,
          },
        } as ActionChunkType;
      } else if (type === 'command') {
        const commandTag = tag.children.find((t) => t.name === 'commandType')!;
        const packageTags = tag.children.filter((t) => t.name === 'package');

        return {
          type: 'action',
          planId: planId,
          data: {
            type: 'command',
            description,
            command: commandTag.content,
            packages: packageTags.map((t) => t.content),
          },
        } as ActionChunkType;
      } else if (type === 'mcpTool') {
        // Handle MCP tool action
        const serverNameTag = tag.children.find((t) => t.name === 'serverName')!;
        const toolIdTag = tag.children.find((t) => t.name === 'toolId')!;
        const argumentsTag = tag.children.find((t) => t.name === 'arguments');
        
        if (!serverNameTag || !toolIdTag) {
          console.error('Invalid MCP tool action: missing serverName or toolId');
          return null;
        }
        
        const serverName = serverNameTag.content;
        const toolId = toolIdTag.content;
        
        // Parse arguments as JSON
        let parsedArguments: Record<string, any> = {};
        try {
          if (argumentsTag) {
            parsedArguments = JSON.parse(argumentsTag.content);
          }
        } catch (error) {
          console.error('Failed to parse MCP tool arguments:', error);
          // Return a default empty object if parsing fails
        }
        
        // Create the action chunk with the correct type
        const mcpToolData: McpToolActionChunkType = {
          type: 'mcpTool',
          description,
          serverName,
          toolId,
          arguments: parsedArguments,
        };
        
        return {
          type: 'action',
          planId: planId,
          data: mcpToolData
        };
      } else {
        return null;
      }
    }
    default:
      return null;
  }
}
