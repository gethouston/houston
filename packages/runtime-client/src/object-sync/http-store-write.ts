import { lstat, readlink } from "node:fs/promises";
import { objectStoreResponseError } from "./http-store-errors";
import { uploadFile } from "./http-store-upload";
import { EXECUTABLE_HEADER, isExecutable, LINK_HEADER } from "./object-attrs";
import { parseObjectManifest } from "./object-manifest";
import type { WriteResult } from "./object-store";
import { StoreConflictError } from "./object-store-errors";
import { withOperationSignal } from "./operation-signal";

/** Upload one object and normalize its generation response. */
export async function uploadHttpObject(input: {
  fetchRequest: Parameters<typeof uploadFile>[0];
  url: string;
  srcFile: string;
  key: string;
  headers: Record<string, string>;
  retryable: boolean;
  capture: (response: Response) => void;
  fileAttrs: boolean;
  discard: (generation: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<WriteResult | undefined> {
  return withOperationSignal(input.signal, (signal) => upload(input, signal));
}

async function send(
  input: Parameters<typeof uploadHttpObject>[0],
  signal: AbortSignal | undefined,
): Promise<{ response: Response; link: boolean }> {
  const info = await lstat(input.srcFile);
  if (!info.isSymbolicLink()) {
    const headers = isExecutable(info.mode)
      ? { ...input.headers, [EXECUTABLE_HEADER]: "1" }
      : input.headers;
    return {
      response: await uploadFile(
        input.fetchRequest,
        input.url,
        input.srcFile,
        headers,
        input.retryable,
        signal,
      ),
      link: false,
    };
  }
  if (!input.fileAttrs)
    throw new Error(`object store PUT ${input.key}: the store keeps no links`);
  const target = await readlink(input.srcFile);
  const response = await input.fetchRequest(
    input.url,
    {
      method: "PUT",
      headers: { ...input.headers, [LINK_HEADER]: "1" },
      body: Buffer.from(target),
      signal,
    },
    { retryable: input.retryable },
  );
  return { response, link: true };
}

async function upload(
  input: Parameters<typeof uploadHttpObject>[0],
  signal: AbortSignal | undefined,
): Promise<WriteResult | undefined> {
  const { response, link } = await send(input, signal);
  input.capture(response);
  if (!response.ok) {
    throw await objectStoreResponseError(response, "PUT", input.key);
  }
  const body: unknown = await response.json();
  const metadata = parseObjectManifest(
    { objects: [body] },
    `object store PUT ${input.key}`,
  )[0];
  if (!metadata) {
    throw new Error(`object store PUT ${input.key} returned a malformed body`);
  }
  const header = response.headers.get("X-Houston-Generation");
  const generation =
    metadata.generation ?? (header && header !== "0" ? header : undefined);
  if (link && response.headers.get(LINK_HEADER) !== "1") {
    console.error(
      `[object-sync] ${input.key}: the store wrote the link as a file; removing it`,
    );
    if (generation !== undefined) await discardOwnWrite(input, generation);
    return undefined;
  }
  return generation === undefined ? undefined : { generation };
}

async function discardOwnWrite(
  input: Parameters<typeof uploadHttpObject>[0],
  generation: string,
): Promise<void> {
  try {
    await input.discard(generation);
  } catch (error) {
    if (!(error instanceof StoreConflictError)) throw error;
  }
}
