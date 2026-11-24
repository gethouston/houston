import { downloadFile } from "./http-store-download";
import { objectStoreResponseError } from "./http-store-errors";
import {
  type DirListing,
  type ObjectMetadata,
  parseDirManifest,
  parseObjectListing,
} from "./object-manifest";
import {
  InvalidObjectPrefixError,
  isObjectPrefix,
  underObjectPrefix,
} from "./object-prefix";
import type { ReadOptions, ReadResult } from "./object-store";
import { withOperationSignal } from "./operation-signal";

type CaptureResponse = (response: Response) => void;
type NoteAttrs = (fileAttrs: boolean) => void;
type SignalledRequest = (signal?: AbortSignal) => Promise<Response>;

export function manifestUrl(
  baseUrl: string,
  prefix: string,
  oneLevel: boolean,
): string {
  if (!isObjectPrefix(prefix)) throw new InvalidObjectPrefixError(prefix);
  const query = [
    ...(prefix ? [`prefix=${encodeURIComponent(prefix)}`] : []),
    ...(oneLevel ? ["delimiter=%2F"] : []),
  ].join("&");
  return `${baseUrl}/manifest${query ? `?${query}` : ""}`;
}

export function readHttpManifest(
  request: SignalledRequest,
  capture: CaptureResponse,
  noteAttrs: NoteAttrs,
  prefix: string,
  signal?: AbortSignal,
): Promise<ObjectMetadata[]> {
  return withOperationSignal(signal, async (own) => {
    const response = await request(own);
    capture(response);
    if (!response.ok) {
      throw await objectStoreResponseError(response, "GET", "manifest");
    }
    const { objects, fileAttrs } = parseObjectListing(
      await response.json(),
      "object store GET manifest",
    );
    noteAttrs(fileAttrs);
    return objects.filter((object) => underObjectPrefix(object.key, prefix));
  });
}

export function readHttpDirManifest(
  request: SignalledRequest,
  capture: CaptureResponse,
  noteAttrs: NoteAttrs,
  signal?: AbortSignal,
): Promise<DirListing | undefined> {
  return withOperationSignal(signal, async (own) => {
    const response = await request(own);
    capture(response);
    if (!response.ok) {
      throw await objectStoreResponseError(response, "GET", "manifest");
    }
    const listing = parseDirManifest(
      await response.json(),
      "object store GET manifest?delimiter=/",
    );
    if (!listing) return undefined;
    const { fileAttrs, ...level } = listing;
    noteAttrs(fileAttrs);
    return level;
  });
}

type ConditionalRequest = (
  signal: AbortSignal | undefined,
  condition: Record<string, string>,
) => Promise<Response>;

export function downloadHttpObject(
  request: ConditionalRequest,
  capture: CaptureResponse,
  key: string,
  destFile: string,
  opts?: ReadOptions,
): Promise<ReadResult> {
  return withOperationSignal(opts?.signal, async (own) => {
    const held = opts?.ifGenerationNotMatch;
    const response = await request(
      own,
      held ? { "X-Houston-If-Generation-Not-Match": held } : {},
    );
    capture(response);
    if (response.status === 304 && held)
      return { generation: held, notModified: true };
    if (!response.ok) {
      throw await objectStoreResponseError(response, "GET", key);
    }
    return downloadFile(response, key, destFile, own);
  });
}
