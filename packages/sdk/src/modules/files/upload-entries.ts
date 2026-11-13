import {
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  type UploadPurpose,
  type UploadSession,
} from "@houston/wire-types";
import { throwIfAborted } from "../abortable-wait";
import type { HttpScope } from "../http";
import { transferUpload } from "./resumable-upload";
import type {
  BlobUpload,
  UploadBatchOptions,
  UploadEntry,
  UploadInput,
  UploadProgress,
} from "./types";
import { uploadFallbackAllowed } from "./upload-errors";

export function uploadBytes(file: UploadInput): number {
  if ("blob" in file) return file.blob.size;
  if ("contentBase64" in file)
    return Math.floor((file.contentBase64.replace(/=+$/, "").length * 3) / 4);
  return 0;
}

export function batchProgress(
  files: UploadInput[],
  opts: UploadBatchOptions | undefined,
  phase: UploadProgress["phase"],
): void {
  throwIfAborted(opts?.signal);
  for (const file of files) {
    const totalBytes = uploadBytes(file);
    opts?.onProgress?.(file, {
      sentBytes: phase === "uploading" ? 0 : totalBytes,
      totalBytes,
      phase,
    });
  }
}

export type PreparedUpload =
  | { kind: "inline"; entry: UploadEntry }
  | {
      kind: "staged";
      file: BlobUpload;
      entry: UploadEntry;
      session: UploadSession;
    };

export async function uploadEntries(
  scope: HttpScope,
  agentId: string,
  files: UploadInput[],
  purpose: UploadPurpose,
  opts?: UploadBatchOptions,
): Promise<PreparedUpload[]> {
  batchProgress(files, opts, "uploading");
  const entries: PreparedUpload[] = [];
  for (const file of files)
    entries.push(await prepareUpload(scope, agentId, file, purpose, opts));
  return entries;
}

export async function prepareUpload(
  scope: HttpScope,
  agentId: string,
  file: UploadInput,
  purpose: UploadPurpose,
  opts?: UploadBatchOptions,
  resume?: UploadSession,
): Promise<PreparedUpload> {
  throwIfAborted(opts?.signal);
  if (!("blob" in file)) return { kind: "inline", entry: file };
  if (file.blob.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    try {
      const session = await transferUpload(
        scope,
        agentId,
        file.blob,
        {
          name: file.name,
          purpose,
          signal: opts?.signal,
          onProgress: (progress) => opts?.onProgress?.(file, progress),
        },
        resume,
      );
      return {
        kind: "staged",
        file,
        session,
        entry: {
          name: file.name,
          relPath: file.relPath,
          uploadId: session.uploadId,
        },
      };
    } catch (error) {
      if (!uploadFallbackAllowed(error)) throw error;
    }
  }
  const bytes = new Uint8Array(await file.blob.arrayBuffer());
  throwIfAborted(opts?.signal);
  // Base64-encode bytes without blowing the call stack on large files (chunked btoa).
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return {
    kind: "inline",
    entry: {
      name: file.name,
      contentBase64: btoa(binary),
      relPath: file.relPath,
    },
  };
}
