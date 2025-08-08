import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import Path from 'node:path';
import { node as execNode, tsx as execTsx, npmInstall as execNpmInstall } from './exec.mjs';

import type { NodeRequestType, NPMInstallRequestType } from './exec.mjs';

export interface ExecutionStrategy {
  runJavascript(options: NodeRequestType): ChildProcess;
  runTypescript(options: NodeRequestType): ChildProcess;
  installDeps(options: NPMInstallRequestType): ChildProcess;
}

class NodeExecutionStrategy implements ExecutionStrategy {
  runJavascript(options: NodeRequestType): ChildProcess {
    return execNode(options);
  }

  runTypescript(options: NodeRequestType): ChildProcess {
    return execTsx(options);
  }

  installDeps(options: NPMInstallRequestType): ChildProcess {
    return execNpmInstall(options);
  }
}

class EchoExecutionStrategy implements ExecutionStrategy {
  runJavascript(options: NodeRequestType): ChildProcess {
    const filename = Path.basename(options.entry);
    const message = `EXECUTOR_ECHO:${filename}`;
    const child = spawn('bash', ['-lc', `echo ${JSON.stringify(message)}`], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    child.stdout.on('data', options.stdout);
    child.stderr.on('data', options.stderr);
    child.on('exit', (code, signal) => options.onExit(code, signal));

    return child;
  }

  runTypescript(options: NodeRequestType): ChildProcess {
    // Same behavior for TS in echo mode
    return this.runJavascript(options);
  }

  installDeps(options: NPMInstallRequestType): ChildProcess {
    const child = spawn('bash', ['-lc', 'echo EXECUTOR_ECHO:NPM_INSTALL'], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
    });

    child.stdout.on('data', options.stdout);
    child.stderr.on('data', options.stderr);
    child.on('exit', (code) => options.onExit(code));

    return child;
  }
}

let cachedStrategy: ExecutionStrategy | null = null;

export function getExecutionStrategy(): ExecutionStrategy {
  if (cachedStrategy) return cachedStrategy;

  const strategyName = (process.env.SRCBOOK_EXECUTOR || 'node').toLowerCase();

  switch (strategyName) {
    case 'node':
      cachedStrategy = new NodeExecutionStrategy();
      break;
    case 'echo':
      cachedStrategy = new EchoExecutionStrategy();
      break;
    default:
      console.warn(
        `Unknown SRCBOOK_EXECUTOR='${strategyName}'. Falling back to 'node' strategy.`,
      );
      cachedStrategy = new NodeExecutionStrategy();
      break;
  }

  console.log(`Using executor: ${strategyName}`);
  return cachedStrategy;
}