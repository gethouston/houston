/**
 * The browser half of an upload: batching dropped `File`s and preserving their
 * folder paths and identity for the SDK. The SDK chooses resumable or base64
 * transfer and reports per-file progress.
 *
 * It stays in the web adapter because `File` and `webkitRelativePath` are DOM
 * types; `@houston/sdk` is deployment-agnostic and receives named Blobs instead.
 * The SDK frames or transfers a batch only when it is about to be sent, so a
 * 2 GB folder drop never holds more than one batch of base64 at once.
 *
 * Shared by composer attachments and the Files section's own upload (HOU-889),
 * which is why the plan and folder-path mapping live beside each other rather
 * than in either caller.
 */

import type { BlobUpload, UploadInput, UploadProgress } from "@houston/sdk";

/**
 * How a surface watches and cancels a batch of browser `File` uploads: one
 * progress report per file, keyed by the `File` the surface handed in.
 */
export interface FileUploadOptions {
  onProgress?: (file: File, progress: UploadProgress) => void;
  signal?: AbortSignal;
}

// A folder can hold hundreds of small files; a request per file would turn one
// drop into hundreds of round trips. Batch small files together up to a modest
// byte budget, well under the host's per-request cap, and give anything larger
// than the budget its own request (the client's per-file limit already bounds
// it to the host cap). Requests stay sequential so per-file host-side dedupe
// never races itself.
const BATCH_BUDGET_BYTES = 8 * 1024 * 1024;
const BATCH_MAX_FILES = 25;

export function planAttachmentBatches(files: readonly File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const f of files) {
    const fits =
      current.length < BATCH_MAX_FILES &&
      currentBytes + f.size <= BATCH_BUDGET_BYTES;
    if (current.length > 0 && !fits) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(f);
    currentBytes += f.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * The upload-relative path for a folder-derived file, or undefined for a plain
 * file. Normalized to forward slashes with no leading slash; a value without a
 * `/` carries no structure and is treated as plain. Shared by composer
 * attachments and the Files section's folder upload (HOU-889).
 */
function uploadRelPath(f: File): string | undefined {
  const raw = f.webkitRelativePath;
  if (!raw) return undefined;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.includes("/") ? normalized : undefined;
}

/**
 * One batch as named Blobs: name, file bytes, folder path.
 * Preserve File identity while the SDK chooses framing and transfer policy.
 */
export function frameBatch(batch: readonly File[]): BlobUpload[] {
  return batch.map((file) => ({
    name: file.name,
    blob: file,
    relPath: uploadRelPath(file),
  }));
}

export function sdkUploadOptions(opts?: FileUploadOptions) {
  return {
    signal: opts?.signal,
    onProgress: (entry: UploadInput, progress: UploadProgress) => {
      if ("blob" in entry && entry.blob instanceof File)
        opts?.onProgress?.(entry.blob, progress);
    },
  };
}
