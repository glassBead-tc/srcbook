import type { ChildProcess } from 'node:child_process';
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

let cachedStrategy: ExecutionStrategy | null = null;

export function getExecutionStrategy(): ExecutionStrategy {
  if (cachedStrategy) return cachedStrategy;

  const strategyName = (process.env.SRCBOOK_EXECUTOR || 'node').toLowerCase();

  switch (strategyName) {
    case 'node':
      cachedStrategy = new NodeExecutionStrategy();
      break;
    default:
      console.warn(
        `Unknown SRCBOOK_EXECUTOR='${strategyName}'. Falling back to 'node' strategy.`,
      );
      cachedStrategy = new NodeExecutionStrategy();
      break;
  }

  return cachedStrategy;
}