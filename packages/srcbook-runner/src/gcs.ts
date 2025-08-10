import { Storage } from "@google-cloud/storage";

const storage = new Storage(); // uses ADC on Cloud Run

export async function writeJson(bucket: string, key: string, data: unknown) {
  const [bkt] = await storage.bucket(bucket).exists();
  if (!bkt) throw new Error(`Bucket not found: ${bucket}`);
  const file = storage.bucket(bucket).file(key);
  await file.save(JSON.stringify(data, null, 2), { contentType: "application/json" });
  return `gs://${bucket}/${key}`;
}