import http from 'node:http';
import { WebSocketServer } from 'ws';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../server/http.mjs';
import wssHandler from '../server/ws.mjs';
import { createSrcbook } from '../srcbook/index.mjs';
import { createSession, addCell } from '../session.mjs';
import { randomid } from '@srcbook/shared';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  wss.on('connection', wssHandler.onConnection);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'string' ? 80 : (address?.port as number);
  baseUrl = `http://127.0.0.1:${port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('REST execution API', () => {
  it('executes a cell and streams outputs via polling', async () => {
    const dir = await createSrcbook('Test', 'javascript');
    const session = await createSession(dir);

    const codeCell = {
      id: randomid(),
      type: 'code' as const,
      source: "console.log('hello from rest')\n",
      language: 'javascript' as const,
      filename: 'index.js',
      status: 'idle' as const,
    };

    // insert after title and package.json cells
    await addCell(session, codeCell, 2);

    const execResp = await fetch(`${baseUrl}/sessions/${session.id}/cells/${codeCell.id}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(execResp.ok).toBe(true);
    const execJson = await execResp.json();
    const execId = execJson.result.execId as string;
    expect(typeof execId).toBe('string');

    // Poll until complete
    let done = false;
    let outputs: Array<{ type: string; data: string }> = [];
    let tries = 0;
    while (!done && tries++ < 80) {
      const poll = await fetch(`${baseUrl}/executions/${execId}`);
      const body = await poll.json();
      const rec = body.result as { status: string; outputs: Array<{ type: string; data: string }> };
      outputs = rec.outputs;
      if (rec.status === 'complete' || rec.status === 'failed') {
        done = true;
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    expect(done).toBe(true);
    expect(outputs.map((o) => o.data).join('')).toContain('hello from rest');
  }, 30000);
});