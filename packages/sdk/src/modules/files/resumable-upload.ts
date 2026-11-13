import {
  chunkContentRange,
  type OpenUploadRequest,
  persistedBytesFromRange,
  statusQueryContentRange,
  UPLOAD_NO_308_HEADER,
  UPLOAD_STATUS_OVERRIDE_HEADER,
} from "@houston/wire-types";
import { isTransportFailure } from "../../transport-failure";
import { throwIfAborted, waitForRetry } from "../abortable-wait";
import type { HttpScope } from "../http";
import { openUpload } from "./open-upload";
import type { UploadOptions } from "./types";
import { UploadTransferError } from "./upload-errors";

export type ResumableUploadOptions = UploadOptions &
  Pick<OpenUploadRequest, "name" | "purpose">;

/**
 * A host or dev gateway answers its own sink as a path, which is appended to
 * the base URL as-is so a base with a path prefix (or a relative base) keeps it.
 */
function sinkUrl(uploadUrl: string, baseUrl: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(uploadUrl)
    ? uploadUrl
    : `${baseUrl}${uploadUrl}`;
}

type TransferState =
  | { kind: "chunk"; offset: number }
  | { kind: "query"; offset: number };

/** Transfers a Blob directly to its sink.
 * @assistant group:files hidden: composite device upload with retry and resume.
 * @assistant unroutable: composes session creation and raw sink PUTs.
 */
export async function upload(
  scope: HttpScope,
  agentId: string,
  blob: Blob,
  opts: ResumableUploadOptions,
): Promise<{ uploadId: string }> {
  throwIfAborted(opts.signal);
  const request = { name: opts.name, size: blob.size, purpose: opts.purpose };
  let session = await openUpload(scope, agentId, request, opts.signal);
  const rawFetch = scope.ports.rawFetch;
  const random = scope.ports.random;
  if (!rawFetch || !random)
    throw new UploadTransferError("Upload transport is not configured");
  let state: TransferState = { kind: "chunk", offset: 0 };
  let failures = 0;
  let restarts = 0;
  const report = (phase: "uploading" | "reconnecting") =>
    opts.onProgress?.({
      sentBytes: state.offset,
      totalBytes: blob.size,
      phase,
    });
  report("uploading");
  for (;;) {
    throwIfAborted(opts.signal);
    const end = Math.min(state.offset + session.chunkBytes, blob.size);
    let res: Response | undefined;
    try {
      res = await rawFetch(sinkUrl(session.uploadUrl, scope.baseUrl), {
        method: "PUT",
        credentials: "omit",
        signal: opts.signal,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range":
            state.kind === "query"
              ? statusQueryContentRange(blob.size)
              : chunkContentRange(state.offset, end, blob.size),
          [UPLOAD_NO_308_HEADER]: "yes",
        },
        body:
          state.kind === "query" ? new Blob([]) : blob.slice(state.offset, end),
      });
    } catch (error) {
      throwIfAborted(opts.signal);
      if (!isTransportFailure(error)) throw error;
      scope.ports.logger.warn("Upload connection interrupted", {
        agentId,
        error: error.message,
      });
    }
    throwIfAborted(opts.signal);
    if (res?.status === 404 || res?.status === 410) {
      if (++restarts > 2)
        throw new UploadTransferError("Upload session repeatedly expired");
      report("reconnecting");
      session = await openUpload(scope, agentId, request, opts.signal);
      state = { kind: "chunk", offset: 0 };
      report("uploading");
      continue;
    }
    const incomplete =
      res?.status === 308 ||
      (res?.status === 200 &&
        res.headers.get(UPLOAD_STATUS_OVERRIDE_HEADER) === "308");
    if (incomplete && res) {
      const offset = persistedBytesFromRange(res.headers.get("Range"));
      if (
        offset !== null &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        offset < blob.size &&
        (state.kind === "query" || offset > state.offset)
      ) {
        if (offset > state.offset) failures = 0;
        state = { kind: "chunk", offset };
        report("uploading");
        continue;
      }
    } else if (res && (res.status === 200 || res.status === 201)) {
      if (state.kind === "chunk" && end !== blob.size) {
        throw new UploadTransferError(
          "Upload sink completed before the final chunk",
        );
      }
      state = { kind: "chunk", offset: blob.size };
      report("uploading");
      return { uploadId: session.uploadId };
    } else if (res && res.status !== 429 && res.status < 500) {
      throw scope.fail(await res.text(), res.status);
    }
    if (++failures > 24)
      throw new UploadTransferError("Upload retry budget exhausted");
    report("reconnecting");
    const ceiling = Math.min(30_000, 1_000 * 2 ** (failures - 1));
    await waitForRetry(scope.ports.clock, random() * ceiling, opts.signal);
    state = { kind: "query", offset: state.offset };
  }
}
