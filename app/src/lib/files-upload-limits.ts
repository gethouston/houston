export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

export interface UploadCandidate {
  name: string;
  size: number;
}

export interface UploadSizeSplit<T extends UploadCandidate> {
  accepted: T[];
  oversized: T[];
}

export function splitOversizedUploads<T extends UploadCandidate>(
  files: readonly T[],
): UploadSizeSplit<T> {
  const accepted: T[] = [];
  const oversized: T[] = [];
  for (const file of files) {
    if (file.size >= MAX_UPLOAD_FILE_BYTES) oversized.push(file);
    else accepted.push(file);
  }
  return { accepted, oversized };
}

const TOO_LARGE_MESSAGE = "upload exceeds the size limit";

export function isUploadTooLargeError(err: unknown): boolean {
  if (typeof err === "string") return err.includes(TOO_LARGE_MESSAGE);
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; message?: unknown };
  if (e.status === 413) return true;
  return typeof e.message === "string" && e.message.includes(TOO_LARGE_MESSAGE);
}
