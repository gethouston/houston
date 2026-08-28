import { downloadFile } from "./http-store-download";
import { objectStoreResponseError } from "./http-store-errors";
import { type ObjectMetadata, parseObjectManifest } from "./object-manifest";
import type { ReadResult } from "./object-store";

type CaptureResponse = (response: Response) => void;

export async function readHttpManifest(
  request: () => Promise<Response>,
  capture: CaptureResponse,
  prefix: string,
): Promise<ObjectMetadata[]> {
  const response = await request();
  capture(response);
  if (!response.ok) {
    throw await objectStoreResponseError(response, "GET", "manifest");
  }
  return parseObjectManifest(
    await response.json(),
    "object store GET manifest",
  ).filter((object) => !prefix || object.key.startsWith(prefix));
}

export async function downloadHttpObject(
  request: () => Promise<Response>,
  capture: CaptureResponse,
  key: string,
  destFile: string,
  signal?: AbortSignal,
): Promise<ReadResult> {
  const response = await request();
  capture(response);
  if (!response.ok) {
    throw await objectStoreResponseError(response, "GET", key);
  }
  return downloadFile(response, key, destFile, signal);
}
