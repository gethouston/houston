import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * Above this a file is hashed through a read stream (64 KB chunks) instead of
 * one whole-file Buffer. Deliberately far below the upload adapter's streaming
 * threshold: hydration hashes sixteen objects at a time and sync-back re-hashes
 * every file in the tree each pass, so a 16 MB threshold let the host hold up
 * to 256 MB of transient Buffers per hydrate — and churn the size of the whole
 * data tree every five minutes — for no gain over streaming.
 */
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
