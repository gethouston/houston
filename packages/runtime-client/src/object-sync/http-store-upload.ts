import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FetchRetryOptions } from "./retry";

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
  signal?: AbortSignal,
): Promise<Response> {
  const { size } = await stat(srcFile);
  if (size < STREAM_UPLOAD_THRESHOLD_BYTES) {
    return fetchRequest(
      url,
      { method: "PUT", headers, body: await readFile(srcFile), signal },
      { retryable },
    );
  }
  return fetchRequest(
    url,
    { method: "PUT", headers, duplex: "half", signal } as RequestInit,
    {
      body: () => Readable.toWeb(createReadStream(srcFile)) as ReadableStream,
      retryable,
    },
  );
}
