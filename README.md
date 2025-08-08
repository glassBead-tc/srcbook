<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/2d5c9dda-044b-49e2-5255-4a0be1085d00/public">
  <source media="(prefers-color-scheme: light)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/064ebb1f-5153-4581-badd-42b42272fc00/public">
  <img alt="Srcbook banner" src="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/064ebb1f-5153-4581-badd-42b42272fc00/public">
</picture>

<p align="center">
  <a href="https://badge.fury.io/js/srcbook"><img src="https://badge.fury.io/js/srcbook.svg" alt="npm version" /></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="Apache 2.0 license" /></a>
</p>

<p align="center">
  <a href="https://srcbook.com">Online app builder</a> ·
  <a href="https://discord.gg/shDEGBSe2d">Discord</a> ·
  <a href="https://www.youtube.com/@srcbook">Youtube</a> ·
  <a href="https://hub.srcbook.com">Hub</a> 
</p>

## Srcbook

Srcbook is a TypeScript-centric app development platform, with 2 main products:

- an AI app builder (also available [hosted online](https://srcbook.com/))
- a TypeScript notebook

Srcbook is open-source (apache2) and runs locally on your machine. You'll need to bring your own API key for AI usage (we strongly recommend Anthropic with `claude-3-5-sonnet-latest`).

## Features

### App Builder

- AI app builder for TypeScript
- Create, edit and run web apps
- Use AI to generate the boilerplate, modify the code, and fix things
- Edit the app with a hot-reloading web preview

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://i.imgur.com/lLJPZOs.png">
  <source media="(prefers-color-scheme: light)" srcset="https://i.imgur.com/k4xAyCQ.png">
  <img alt="Example Srcbook" src="https://i.imgur.com/k4xAyCQ.png">
</picture>

### Notebooks

- Create, run, and share TypeScript notebooks
- Export to valid markdown format (.src.md)
- AI features for exploring and iterating on ideas
- Diagraming with [mermaid](https://mermaid.js.org) for rich annotations
- Local execution with a web interface
- Powered by Node.js

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/2a4fa0f6-ef1b-4606-c9fa-b31d61b7c300/public">
  <source media="(prefers-color-scheme: light)" srcset="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/ebfa2bfe-f805-4398-a348-0f48d4f93400/public">
  <img alt="Example Srcbook" src="https://imagedelivery.net/oEu9i3VEvGGhcGGAYXSBLQ/ebfa2bfe-f805-4398-a348-0f48d4f93400/public">
</picture>

## FAQ

See [FAQ](https://github.com/srcbookdev/srcbook/blob/main/FAQ.md).

## Getting Started

Srcbook runs locally on your machine as a CLI application with a web interface.

### Requirements

- Node 18+, we recommend using [nvm](https://github.com/nvm-sh/nvm) to manage local node versions
- [corepack](https://nodejs.org/api/corepack.html) to manage package manager versions

### Installing

We recommend using npx to always run the latest version from npm

```bash
# Using npm
npx srcbook@latest start

# Using your pm equivalent
pnpm dlx srcbook@latest start
```

> You can instead use a global install with `<pkg manager> i -g srcbook`
> and then directly call srcbook with `srcbook start`

### Headless mode

Use `--headless` to run without opening a browser, suitable for servers/containers.

```bash
npx srcbook@latest start --headless --port 2150
```

- PORT: `--port` flag or `PORT` env var (default 2150)
- Data dir: `SRCBOOK_HOME` to override `~/.srcbook`

### Using Docker

You can also run Srcbook using Docker:

```bash
# Build the Docker image
docker build -t srcbook .

# Run the container (headless)
# -p maps port 2150, -v mounts your data dir, and npm cache for performance
docker run -p 2150:2150 \
  -e NODE_ENV=production \
  -e PORT=2150 \
  -e SRCBOOK_HOME=/root/.srcbook \
  -e SRCBOOK_DISABLE_ANALYTICS=true \
  -v ~/.srcbook:/root/.srcbook \
  -v ~/.npm:/root/.npm \
  srcbook pnpm start
```

Make sure to set up your AI API key after starting the container. You can do this via REST (see below) or through the web interface at `http://localhost:2150`.

### REST API

The server exposes a JSON REST API under `/api`.

- Create/open a session for a srcbook directory:
  - `POST /api/sessions` body: `{ "path": "/path/to/.srcbook/srcbooks/<id>" }`
- List sessions: `GET /api/sessions`
- Get a session: `GET /api/sessions/:id`
- Export session as inline .src.md: `GET /api/sessions/:id/export-text`
- Import a srcbook:
  - From local .src.md: `POST /api/import` body: `{ "path": "/abs/path/file.src.md" }`
  - From raw text: `POST /api/import` body: `{ "text": "...srcmd..." }`
  - From URL: `POST /api/import` body: `{ "url": "https://.../file.src.md" }`
- Generate cells with AI: `POST /api/sessions/:id/generate_cells` body: `{ "insertIdx": 1, "query": "Add a hello world cell" }`
- Settings:
  - Get: `GET /api/settings`
  - Update: `POST /api/settings` (partial Config object)
- Secrets:
  - List: `GET /api/secrets`
  - Create/update: `POST /api/secrets` body: `{ "name": "OPENAI_API_KEY", "value": "sk-..." }`
  - Rename/update: `POST /api/secrets/:name` body: `{ "name": "NEW_NAME", "value": "..." }`
  - Delete: `DELETE /api/secrets/:name`
  - Associate with session: `PUT /api/sessions/:id/secrets/:name`
  - Disassociate from session: `DELETE /api/sessions/:id/secrets/:name`
- Examples: `GET /api/examples`
- Generate srcbook from prompt: `POST /api/generate` body: `{ "query": "..." }`
- AI healthcheck: `GET /api/ai/healthcheck`

Cell creation, editing and execution are performed over WebSocket channels. See the example below.

### Minimal headless example (REST + WebSocket)

The following shows how to run the server in headless mode inside a container, then create a session, add a cell, run it, and stream the output.

```bash
# Start server headless (host)
docker run -d --name srcbook --rm \
  -p 2150:2150 \
  -e NODE_ENV=production -e PORT=2150 -e SRCBOOK_DISABLE_ANALYTICS=true \
  -v ~/.srcbook:/root/.srcbook -v ~/.npm:/root/.npm \
  srcbook pnpm start

# Create a srcbook from text via import
curl -s localhost:2150/api/import -H 'Content-Type: application/json' \
  -d '{"text":"# Title\n\n```ts\nconsole.log(\"hello\")\n```"}'
# => { "error": false, "result": { "dir": "/root/.srcbook/srcbooks/<id>" } }

# Open a session
SESSION_ID=$(curl -s localhost:2150/api/sessions -H 'Content-Type: application/json' \
  -d '{"path":"/root/.srcbook/srcbooks/<id>"}' | jq -r '.result.id')

# Use WebSocket to add and run a cell
# Node example script (save as run.js)
cat > run.js <<'JS'
import WebSocket from 'ws';

const sessionId = process.argv[2];
const ws = new WebSocket('ws://localhost:2150/websocket');

function send(topic, event, payload) {
  ws.send(JSON.stringify({ topic, event, payload }));
}

ws.on('open', () => {
  // Subscribe to session channel
  send(`session:${sessionId}`, 'subscribe', { id: 'cli' });
  // Create a new TypeScript code cell at index 1
  send(`session:${sessionId}`, 'cell:create', {
    index: 1,
    cell: { type: 'code', language: 'typescript', filename: 'hello.ts', source: 'console.log("hi")' }
  });
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.event === 'cell:updated' && msg.payload.cell?.filename === 'hello.ts') {
    // Run the cell after creation
    send(`session:${sessionId}`, 'cell:exec', { cellId: msg.payload.cell.id });
  }
  if (msg.event === 'cell:output') {
    process.stdout.write(msg.payload.output.data);
  }
});
JS

node run.js "$SESSION_ID"
```

### Configuration

- Server port: `--port` flag or `PORT` env var
- Data directory: `SRCBOOK_HOME` (defaults to `~/.srcbook`)
- AI provider/model and keys are persisted via `/api/settings` and `/api/secrets` endpoints

### Analytics and tracking

In order to improve Srcbook, we collect some behavioral analytics. We don't collect any Personal Identifiable Information (PII), our goals are simply to improve the application. The code is open source so you don't have to trust us, you can verify! You can find more information in our [privacy policy](https://github.com/srcbookdev/srcbook/blob/main/PRIVACY-POLICY.md).

If you want to disable tracking, you can run Srcbook with `SRCBOOK_DISABLE_ANALYTICS=true` set in the environment.

## Uninstalling

You can remove srcbook by first removing the package, and then cleaning it's local directory on disk:

```bash
rm -rf ~/.srcbook

# if you configured a global install
npm uninstall -g srcbook
```

> if you used another pm you will need to use it's specific uninstall command

## Contributing

For development instructions, see [CONTRIBUTING.md](https://github.com/srcbookdev/srcbook/blob/main/CONTRIBUTING.md).
