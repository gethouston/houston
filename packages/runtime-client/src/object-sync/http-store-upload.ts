import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FetchRetryOptions } from "./retry";

/** Above this size each upload attempt opens a fresh disk stream. */
export const STREAM_UPLOAD_THRESHOLD_BYTES = 16 * 1024 * 1024;

type StoreFetch = (
  url: string,
  init?: RequestInit,
  extra?: Pick<FetchRetryOptions, "body" | "retryable">,
) => Promise<Response>;

export async function uploadFile(
  fetchRequest: StoreFetch,
  url: string,
  srcFile: string,
  headers: Record<string, string>,
  retryable: boolean,
): Promise<Response> {
  const { size } = await stat(srcFile);
  if (size < STREAM_UPLOAD_THRESHOLD_BYTES) {
    return fetchRequest(
      url,
      { method: "PUT", headers, body: await readFile(srcFile) },
      { retryable },
    );
  }
  return fetchRequest(
    url,
    { method: "PUT", headers, duplex: "half" } as RequestInit,
    {
      body: () => Readable.toWeb(createReadStream(srcFile)) as ReadableStream,
      retryable,
    },
  );
}
