import { cartesianSizes, indexToCoords, coordsToParams, totalPoints, Grid } from "./params.js";
import { writeJson } from "./gcs.js";

async function main() {
  const taskIndex = Number(process.env.CLOUD_RUN_TASK_INDEX ?? process.env.LOCAL_TASK_INDEX ?? "0");
  const taskCount = Number(process.env.CLOUD_RUN_TASK_COUNT ?? process.env.LOCAL_TASK_COUNT ?? "1");
  const runId = process.env.RUN_ID ?? `local-${Date.now()}`;
  const bucket = process.env.OUTPUT_BUCKET ?? "";
  const outPrefix = process.env.OUTPUT_PREFIX ?? `runs/${runId}`;
  const notebook = process.env.NB_PATH ?? "notebooks/sim.ts";
  const rawSpec = process.env.PARAM_SPEC_JSON; // inline JSON OR
  const specUri = process.env.SPEC_URI; // gs://bucket/path.json (optional)

  if (!bucket) throw new Error("OUTPUT_BUCKET env var required");

  // Load param grid
  let grid: Grid;
  if (rawSpec) {
    grid = JSON.parse(rawSpec).grid as Grid;
  } else if (specUri?.startsWith("gs://")) {
    const m = specUri.replace("gs://", "").split("/");
    const specBucket = m.shift()!;
    const key = m.join("/");
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage();
    const [buf] = await storage.bucket(specBucket).file(key).download();
    grid = JSON.parse(buf.toString()).grid as Grid;
  } else {
    throw new Error("Provide PARAM_SPEC_JSON or SPEC_URI");
  }

  const N = totalPoints(grid);
  // Minimal sanity: let the job launch with tasks==N where possible.
  if (process.env.CLOUD_RUN_TASK_COUNT && Number(process.env.CLOUD_RUN_TASK_COUNT) !== N) {
    // Not fatal; we allow oversubscription via work-stealing in v2.
    console.error(`WARN: TASK_COUNT(${taskCount}) != totalPoints(${N})`);
  }
  if (taskIndex >= N) {
    console.log(`Skipping task ${taskIndex}; beyond N=${N}`);
    return;
  }

  const sizes = cartesianSizes(grid);
  const coords = indexToCoords(taskIndex, sizes);
  const params = coordsToParams(grid, coords);

  const startedAt = new Date().toISOString();

  // TODO: replace with real Srcbook headless execution
  // For now, call a pure function or script that performs the simulation.
  const result = await runSimulation(notebook, params); // implement this to meet your needs

  const endedAt = new Date().toISOString();
  const payload = { runId: runId, taskIndex, params, startedAt, endedAt, result };

  const key = `${outPrefix}/${String(taskIndex).padStart(6, "0")}/result.json`;
  const uri = await writeJson(bucket, key, payload);
  console.log(JSON.stringify({ status: "ok", taskIndex, uri }));
}

async function runSimulation(_notebook: string, params: any) {
  // placeholder: compute something deterministic
  const metric = Math.sin(Number(params.beta ?? 0)) + Number(params.gamma ?? 0);
  return { metric };
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});