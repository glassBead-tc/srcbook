import { Logging } from "@google-cloud/logging";

function shortExecutionName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}

export async function getLogs({
  projectId,
  region,
  execution,
  taskIndex,
  tail
}: {
  projectId: string;
  region: string;
  execution: string;
  taskIndex?: number;
  tail?: number;
}): Promise<string> {
  const logging = new Logging({ projectId });
  const execName = shortExecutionName(execution);

  // Cloud Run Jobs logs use resource.type="cloud_run_job" and labels for execution and task
  const filters = [
    'resource.type="cloud_run_job"',
    `labels."run.googleapis.com/execution_name"="${execName}"`
  ];
  if (typeof taskIndex === "number") {
    filters.push(`labels."run.googleapis.com/task_index"="${taskIndex}"`);
  }
  // Include both stdout and stderr
  const filter = filters.join(" AND ");

  const pageSize = Math.min(Math.max(tail ?? 200, 1), 1000);
  const [entries] = await logging.getEntries({ filter, orderBy: "timestamp desc", pageSize });
  const lines = entries
    .map(e => {
      const ts = e.metadata.timestamp instanceof Date ? e.metadata.timestamp.toISOString() : String(e.metadata.timestamp ?? "");
      const sev = e.metadata.severity ?? "DEFAULT";
      const lbls: any = e.metadata.labels ?? {};
      const idx = lbls["run.googleapis.com/task_index"] ?? "";
      const container = lbls["k8s-pod/app_kubernetes_io/name"] || e.metadata.resource?.labels?.container || "";
      const payload: any = e.data as any;
      const msg = typeof payload === "string" ? payload : payload?.message || payload?.textPayload || JSON.stringify(payload);
      return `${ts} [${sev}] [task ${idx}] ${msg}`;
    })
    .reverse(); // chronological

  return lines.join("\n");
}