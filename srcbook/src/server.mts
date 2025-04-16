/**
 * Run the Srcbook application.
 *
 * For this, we need to:
 *  - Serve the API
 *  - Serve the WebSocket server
 *  - Serve the React frontend
 *
 */
import readline from 'node:readline';
import http from 'node:http';
import express from 'express';
// @ts-ignore
import { WebSocketServer as WsWebSocketServer } from 'ws';
import { wss, app, posthog, initializeMCP } from '@srcbook/api';
import chalk from 'chalk';
import { pathTo, getPackageJson } from './utils.mjs';

function clearScreen() {
  const repeatCount = process.stdout.rows - 2;
  const blank = repeatCount > 0 ? '\n'.repeat(repeatCount) : '';
  console.log(blank);
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
}

clearScreen();

console.log(chalk.bgGreen.black('  Srcbook  '));

const PUBLIC_DIR = pathTo('public');
const INDEX_HTML = pathTo('public', 'index.html');

// Serve the static files, compiled from the packages/web/ React app
console.log(chalk.dim('Serving static files (React app)...'));
app.use(express.static(PUBLIC_DIR));
const server = http.createServer(app);

// Create the WebSocket server
console.log(chalk.dim('Creating WebSocket server...'));
const webSocketServer = new WsWebSocketServer({ server });
webSocketServer.on('connection', wss.onConnection);

// Initialize MCP client manager
console.log(chalk.dim('Initializing MCP client manager...'));
initializeMCP().catch(error => {
  console.error('Failed to initialize MCP client manager:', error);
  console.log(chalk.yellow('MCP functionality will be limited or unavailable.'));
});

// Serve the react-app for all other routes, handled by client-side routing
app.get('*', (_req, res) => res.sendFile(INDEX_HTML));

console.log(chalk.green('Initialization complete'));

const port = Number(process.env.PORT ?? 2150);
const url = `http://localhost:${port}`;

posthog.capture({ event: 'user started Srcbook application' });

const { name, version } = getPackageJson();

server.listen(port, () => {
  console.log(`${name}@${version} running at ${url}`);
  // @ts-ignore
  process.send('{"type":"init"}');
});

process.on('SIGINT', async () => {
  console.log(chalk.dim('Shutting down...'));

  // Ensure we gracefully shutdown posthog since it may need to flush events
  console.log(chalk.dim('Shutting down PostHog...'));
  posthog.shutdown();

  // Shutdown MCP client manager
  try {
    console.log(chalk.dim('Shutting down MCP client manager...'));
    const { getMCPClientManager } = await import('@srcbook/api');
    const mcpClientManager = getMCPClientManager();
    await mcpClientManager.close();
  } catch (error) {
    console.error('Error shutting down MCP client manager:', error);
  }

  // Close the server
  console.log(chalk.dim('Closing server...'));
  server.close();

  process.exit();
});
