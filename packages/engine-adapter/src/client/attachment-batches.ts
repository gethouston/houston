import type { BlobUpload, UploadInput, UploadProgress } from "@houston/sdk";

export interface FileUploadOptions {
  onProgress?: (file: File, progress: UploadProgress) => void;
  signal?: AbortSignal;
}

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

function uploadRelPath(f: File): string | undefined {
  const raw = f.webkitRelativePath;
  if (!raw) return undefined;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.includes("/") ? normalized : undefined;
}

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
