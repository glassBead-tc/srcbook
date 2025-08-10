import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import { Storage } from "@google-cloud/storage";

const exec = promisify(execCb);

// Local helper: compute total points from a spec grid
// We duplicate logic to avoid cross-package imports
function computeTotalPoints(spec: any): number {
  const grid = spec?.grid ?? {};
  return Object.values(grid).reduce((acc: number, axis: any) => acc * (Array.isArray(axis) ? axis.length : 0), 1);
}

function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}

function shortExecutionName(name: string): string {
  // Accept either full resource name or short execution id, return short id
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}

export interface SubmitArgs {
  image: string;
  projectId: string;
  region: string;
  jobName?: string;
  parallelism?: number;
  timeoutSeconds?: number;
  cpu?: string;
  memory?: string;
  spec: any; // { grid: { ... } }
  bucket: string;
  nbPath: string;
}

export async function submitSweep(args: SubmitArgs) {
  const { image, projectId, region, jobName = "srcbook-sim", parallelism, timeoutSeconds = 3600, spec, bucket, nbPath } = args;

  const taskCount = computeTotalPoints(spec);
  if (!taskCount || taskCount < 0) throw new Error("Invalid spec.grid; taskCount computed as 0");

  const par = Math.max(1, Math.min(parallelism ?? Math.min(taskCount, 100), taskCount));
  const runId = generateRunId();

  // Upload spec to GCS to avoid env var size/quoting limits
  const storage = new Storage({ projectId });
  const specKey = `runs/${runId}/spec.json`;
  await storage.bucket(bucket).file(specKey).save(JSON.stringify(spec, null, 2), { contentType: "application/json" });
  const specUri = `gs://${bucket}/${specKey}`;

  const envPairs = [
    `RUN_ID=${runId}`,
    `OUTPUT_BUCKET=${bucket}`,
    `NB_PATH=${nbPath}`,
    `SPEC_URI=${specUri}`
  ];

  const cmd = [
    "gcloud",
    "run",
    "jobs",
    "execute",
    jobName,
    "--region",
    region,
    "--project",
    projectId,
    `--tasks=${taskCount}`,
    `--parallelism=${par}`,
    `--task-timeout=${timeoutSeconds}s`,
    `--update-env-vars=${envPairs.join(",")}`,
    "--format=json"
  ].join(" ");

  const { stdout, stderr } = await exec(cmd);
  if (stderr && stderr.trim().length > 0) {
    // gcloud often prints warnings to stderr; do not fail on them
    // Console noise is acceptable
  }
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse gcloud output: ${stdout}`);
  }

  // Execution name can be in different fields depending on version; normalize
  let executionFullName: string | undefined = json?.name || json?.metadata?.name || json?.execution || undefined;
  if (!executionFullName) {
    // Try to construct from job
    const execId = json?.latestCreatedExecution || json?.latestCreatedExecutionName;
    if (execId) executionFullName = execId;
  }
  if (!executionFullName) throw new Error(`Could not determine execution name from response: ${stdout}`);

  const execution = shortExecutionName(executionFullName);

  return {
    execution,
    runId,
    taskCount,
    parallelism: par,
    specUri
  };
}

export async function getStatus({ projectId, region, execution }: { projectId: string; region: string; execution: string }) {
  const execName = shortExecutionName(execution);
  const cmd = [
    "gcloud",
    "run",
    "jobs",
    "executions",
    "describe",
    execName,
    "--region",
    region,
    "--project",
    projectId,
    "--format=json"
  ].join(" ");
  const { stdout } = await exec(cmd);
  const json = JSON.parse(stdout);
  return json;
}

export async function cancelExec({ projectId, region, execution }: { projectId: string; region: string; execution: string }) {
  const execName = shortExecutionName(execution);
  const cmd = [
    "gcloud",
    "run",
    "jobs",
    "executions",
    "cancel",
    execName,
    "--region",
    region,
    "--project",
    projectId,
    "--format=json"
  ].join(" ");
  const { stdout } = await exec(cmd);
  const json = JSON.parse(stdout);
  return json;
}

export async function fetchArtifact({ bucket, key, expiresSec }: { bucket: string; key: string; expiresSec?: number }) {
  const gsUri = `gs://${bucket}/${key}`;
  if (!expiresSec) return { uri: gsUri };
  const storage = new Storage();
  const [url] = await storage
    .bucket(bucket)
    .file(key)
    .getSignedUrl({ action: "read", expires: Date.now() + expiresSec * 1000 });
  return { uri: gsUri, signedUrl: url, expiresInSec: expiresSec };
}