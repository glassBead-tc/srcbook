import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { pathTo, getPackageJson, isPortAvailable } from './utils.mjs';
import open from 'open';
import { pathToFileURL } from 'node:url';

function openInBrowser(url: string) {
  open(url).then(
    () => {},
    () => {},
  );
}

function startServer(port: string, headless: boolean, callback: () => void) {
  const server = spawn('node', [pathTo('dist', 'src', 'server.mjs')], {
    // Inherit stdio configurations from CLI (parent) process and allow IPC
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port,
      HEADLESS: headless ? '1' : '0',
    },
  });

  // Exit the CLI (parent) process when the server (child) process closes
  server.on('close', (code) => {
    process.exit(code);
  });

  // Listen to messages sent from the server (child) process
  server.on('message', (data: string) => {
    const message = JSON.parse(data);
    if (message.type === 'init') {
      callback();
    }
  });

  // Kill the server (child) process when the CLI (parent) process terminates from an exception
  process.on('uncaughtException', (error) => {
    console.error(error);
    server.kill();
  });
}

export default function program() {
  const { name, description, version } = getPackageJson();

  const program = new Command();

  program.name(name).description(description).version(version);

  program
    .command('start')
    .description('Start the Srcbook server')
    .option('-p, --port <port>', 'Port to run the server on', '2150')

    .option('--headless', 'Run without opening a browser', false)
    .action(({ port, headless }) => {
      startServer(port, () => {
        if (!headless) {

          openInBrowser(`http://localhost:${port}`);
        }
      });
    });

  program
    .command('import')
    .description('Import a Srcbook')
    .option('-p, --port <port>', 'Port of the server', '2150')
    .argument('<specifier>', 'An identifier of a Srcbook on hub.srcbook.com')
    .action(async (specifier, { port }) => {
      const portAvailable = await isPortAvailable('localhost', port);

      if (portAvailable) {
        return doImport(specifier, port);
      }

      startServer(port, false, () => {
        doImport(specifier, port);
      });
    });

  program.parse();
}

// If executed directly (e.g., node dist/src/cli.mjs ...), run the program
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  program();
}

async function doImport(specifier: string, port: string) {
  const filepath = specifier.endsWith('.src.md') ? specifier : `${specifier}.src.md`;
  const srcbookUrl = `https://hub.srcbook.com/srcbooks/${filepath}`;

  const sessionId = await importSrcbook(srcbookUrl, port);

  openInBrowser(`http://localhost:${port}/srcbooks/${sessionId}`);
}

async function importSrcbook(srcbookUrl: string, port: string) {
  const importResponse = await fetch(`http://localhost:${port}/api/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: srcbookUrl }),
  });

  if (!importResponse.ok || importResponse.status !== 200) {
    console.error(`Cannot import ${srcbookUrl}`);
    process.exit(1);
  }

  const importResponseBody = await importResponse.json();

  const sessionsResponse = await fetch(`http://localhost:${port}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: importResponseBody.result.dir }),
  });

  if (!sessionsResponse.ok || sessionsResponse.status !== 200) {
    console.error(`Failed to open ${srcbookUrl}`);
    process.exit(1);
  }

  const sessionsResponseBody = await sessionsResponse.json();

  return sessionsResponseBody.result.id;
}
