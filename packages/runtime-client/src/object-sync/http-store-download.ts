import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { ReadResult } from "./object-store";

/** Atomically land one successful object GET and retain its generation. */
export async function downloadFile(
  response: Response,
  key: string,
  destFile: string,
  signal?: AbortSignal,
): Promise<ReadResult> {
  if (!response.body) {
    throw new Error(`object store GET ${key} returned no response body`);
  }
  await mkdir(dirname(destFile), { recursive: true });
  const tempFile = `${destFile}.${randomUUID()}.tmp`;
  try {
    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream),
      createWriteStream(tempFile),
      ...(signal ? [{ signal }] : []),
    );
    await rename(tempFile, destFile);
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
  const generation = response.headers.get("X-Houston-Generation");
  return generation && generation !== "0" ? { generation } : {};
}
