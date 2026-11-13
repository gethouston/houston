import {
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  type UploadPurpose,
} from "@houston/wire-types";
import { throwIfAborted } from "../abortable-wait";
import type { HttpScope } from "../http";
import { upload } from "./resumable-upload";
import type {
  UploadBatchOptions,
  UploadEntry,
  UploadInput,
  UploadProgress,
} from "./types";
import { UploadSessionsUnavailableError } from "./upload-errors";

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

export async function uploadEntries(
  scope: HttpScope,
  agentId: string,
  files: UploadInput[],
  purpose: UploadPurpose,
  opts?: UploadBatchOptions,
): Promise<UploadEntry[]> {
  batchProgress(files, opts, "uploading");
  const entries: UploadEntry[] = [];
  for (const file of files) {
    throwIfAborted(opts?.signal);
    if (!("blob" in file)) {
      entries.push(file);
      continue;
    }
    if (file.blob.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      try {
        const { uploadId } = await upload(scope, agentId, file.blob, {
          name: file.name,
          purpose,
          signal: opts?.signal,
          onProgress: (progress) => opts?.onProgress?.(file, progress),
        });
        entries.push({ name: file.name, relPath: file.relPath, uploadId });
        continue;
      } catch (error) {
        if (!(error instanceof UploadSessionsUnavailableError)) throw error;
      }
    }
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    throwIfAborted(opts?.signal);
    // Base64-encode bytes without blowing the call stack on large files (chunked btoa).
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    entries.push({
      name: file.name,
      contentBase64: btoa(binary),
      relPath: file.relPath,
    });
  }
  return entries;
}
