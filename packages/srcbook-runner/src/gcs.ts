import { Storage } from "@google-cloud/storage";
import { promises as fs } from "node:fs";
import path from "node:path";

const storage = new Storage(); // uses ADC on Cloud Run

function shouldWriteLocal(bucket: string): boolean {
  if (process.env.FORCE_LOCAL === "1") return true;
  if (process.env.LOCAL_OUTPUT_DIR) return true;
  if (bucket.startsWith("file://") || bucket.startsWith("local://")) return true;
  if (bucket === "local" || bucket === "local-dummy") return true;
  return false;
}

async function writeLocal(key: string, data: unknown) {
  const baseDir = process.env.LOCAL_OUTPUT_DIR || path.resolve(process.cwd(), "./.local_runs");
  const outPath = path.resolve(baseDir, key);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf-8");
  return `file://${outPath}`;
}

export async function writeJson(bucket: string, key: string, data: unknown) {
  if (shouldWriteLocal(bucket)) {
    return writeLocal(key, data);
  }
  const [bkt] = await storage.bucket(bucket).exists();
  if (!bkt) {
    // Fallback to local if bucket not found in local dev scenarios
    if (process.env.NODE_ENV !== "production") {
      return writeLocal(key, data);
    }
    throw new Error(`Bucket not found: ${bucket}`);
  }
  const file = storage.bucket(bucket).file(key);
  await file.save(JSON.stringify(data, null, 2), { contentType: "application/json" });
  return `gs://${bucket}/${key}`;
}