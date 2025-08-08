import type { CodeCellType } from '@srcbook/shared';
import { randomid } from '@srcbook/shared';

export type ExecutionOutput = { type: 'stdout' | 'stderr'; data: string };

export type ExecutionRecord = {
  id: string;
  sessionId: string;
  cellId: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: number;
  completedAt?: number;
  exitCode?: number | null;
  outputs: ExecutionOutput[];
};

export type ExecutionListener = (event: { type: 'output' | 'status'; data: any }) => void;

class ExecutionsStore {
  private executions = new Map<string, ExecutionRecord>();
  private listeners = new Map<string, Set<ExecutionListener>>();

  create(sessionId: string, cell: CodeCellType) {
    const id = randomid();
    const record: ExecutionRecord = {
      id,
      sessionId,
      cellId: cell.id,
      status: 'running',
      startedAt: Date.now(),
      outputs: [],
    };
    this.executions.set(id, record);
    return record;
  }

  get(execId: string) {
    return this.executions.get(execId);
  }

  appendOutput(execId: string, output: ExecutionOutput) {
    const rec = this.executions.get(execId);
    if (!rec) return;
    rec.outputs.push(output);
    this.emit(execId, { type: 'output', data: output });
  }

  complete(execId: string, exitCode: number | null) {
    const rec = this.executions.get(execId);
    if (!rec) return;
    rec.status = exitCode === 0 ? 'complete' : 'failed';
    rec.exitCode = exitCode;
    rec.completedAt = Date.now();
    this.emit(execId, { type: 'status', data: { status: rec.status, exitCode } });
  }

  subscribe(execId: string, listener: ExecutionListener) {
    if (!this.listeners.has(execId)) {
      this.listeners.set(execId, new Set());
    }
    this.listeners.get(execId)!.add(listener);
    return () => this.listeners.get(execId)!.delete(listener);
  }

  private emit(execId: string, evt: { type: 'output' | 'status'; data: any }) {
    const subs = this.listeners.get(execId);
    if (!subs) return;
    for (const l of subs) l(evt);
  }
}

const executions = new ExecutionsStore();

export default executions;