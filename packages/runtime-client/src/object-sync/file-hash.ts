import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

export const STREAM_HASH_THRESHOLD_BYTES = 1024 * 1024;

export async function fileSha256(abs: string, size: number): Promise<string> {
  if (size < STREAM_HASH_THRESHOLD_BYTES) {
    return createHash("sha256")
      .update(await readFile(abs))
      .digest("hex");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(abs)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
