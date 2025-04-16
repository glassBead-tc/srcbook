import http from 'node:http';
import { WebSocketServer as WsWebSocketServer } from 'ws';

import app from './server/http.mjs';
import webSocketServer from './server/ws.mjs';
import { initializeMCP } from './mcp/index.mjs';

export { SRCBOOK_DIR } from './constants.mjs';

// Initialize MCP client manager
console.log('Initializing MCP client manager...');
initializeMCP().catch((error) => {
  console.error('Failed to initialize MCP client manager:', error);
  console.log('MCP functionality will be limited or unavailable.');
});

const server = http.createServer(app);

const wss = new WsWebSocketServer({ server });
wss.on('connection', webSocketServer.onConnection);

const port = process.env.PORT || 2150;
server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

process.on('SIGINT', async function () {
  // Shutdown MCP client manager
  try {
    console.log('Shutting down MCP client manager...');
    const { getMCPClientManager } = await import('./mcp/client-manager.mjs');
    const mcpClientManager = getMCPClientManager();
    await mcpClientManager.close();
  } catch (error) {
    console.error('Error shutting down MCP client manager:', error);
  }

  server.close();
  process.exit();
});
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', async () => {
    // Shutdown MCP client manager
    try {
      console.log('Shutting down MCP client manager before reload...');
      const { getMCPClientManager } = await import('./mcp/client-manager.mjs');
      const mcpClientManager = getMCPClientManager();
      await mcpClientManager.close();
    } catch (error) {
      console.error('Error shutting down MCP client manager:', error);
    }

    wss.close();
    server.close();
  });

  import.meta.hot.dispose(async () => {
    // Shutdown MCP client manager
    try {
      console.log('Shutting down MCP client manager on dispose...');
      const { getMCPClientManager } = await import('./mcp/client-manager.mjs');
      const mcpClientManager = getMCPClientManager();
      await mcpClientManager.close();
    } catch (error) {
      console.error('Error shutting down MCP client manager:', error);
    }

    wss.close();
    server.close();
  });
}
