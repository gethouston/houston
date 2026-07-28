/**
 * The Files-tab upload size cap, mirrored client side.
 *
 * The host refuses an import whose decoded payload exceeds `MAX_UPLOAD_BYTES`
 * (`packages/host/src/turn/files-import.ts`) with a 413. The constant is
 * duplicated here on purpose: `app/` never imports from the host package, and
 * catching an oversized file BEFORE the base64 encode saves the user a long
 * upload that could only ever end in a rejection.
 *
 * Two distinct failures live here because the caps differ in shape: the client
 * check is per file (we can name the offender), the host check is on the whole
 * request (it can only say "too big"). Both surface as calm, explainable
 * toasts, never the red report-a-bug pair: an oversized file is a
 * user-understandable state, not a Houston bug.
 */

/**
 * Same value as the host's `MAX_UPLOAD_BYTES`. The client check is strict
 * (`>=`, not `>`): the host measures the base64 payload through an estimator
 * that rounds UP, so a file of exactly this size still 413s server-side. Letting
 * it through would trade a calm, instant "too large" toast for a long upload
 * that can only end in a rejection.
 */
export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

/** The shape both `File` and test fixtures satisfy. */
export interface UploadCandidate {
  name: string;
  size: number;
}

export interface UploadSizeSplit<T extends UploadCandidate> {
  accepted: T[];
  oversized: T[];
}

/**
 * Split a picked/dropped batch into what we can upload and what is too big.
 * An oversized file never aborts the batch: the valid files still upload and
 * the caller names the rejected ones in a toast, so the user always knows
 * exactly what landed.
 */
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

/** The host's exact wording (`packages/host/src/turn/files-import.ts`). */
const TOO_LARGE_MESSAGE = "upload exceeds the size limit";

/**
 * True when the host refused an upload for exceeding its size cap. Reads the
 * structural `.status` exposed by `HoustonEngineError` first (the reliable
 * signal); the message match is the fallback for the wire shapes that carry no
 * status, including a thrown bare string.
 */
export function isUploadTooLargeError(err: unknown): boolean {
  if (typeof err === "string") return err.includes(TOO_LARGE_MESSAGE);
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; message?: unknown };
  if (e.status === 413) return true;
  return typeof e.message === "string" && e.message.includes(TOO_LARGE_MESSAGE);
}
