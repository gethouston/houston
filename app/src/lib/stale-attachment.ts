/**
 * A composer attachment whose backing file changed on disk between attach and
 * send. The browser holds a `File` as a lazy handle and re-validates it when
 * the upload finally reads the bytes; a file the user deleted, moved, or
 * modified in the meantime throws a `NotFoundError` / `NotReadableError`
 * DOMException ("A requested file or directory could not be found at the time
 * an operation was processed."). Every occurrence to date is Windows WebView2
 * (HOUSTON-APP-4YX), typically a file attached from a temp or cloud-synced
 * folder that vanished before send.
 *
 * This is an EXPECTED user-actionable state, not a Houston bug: the stale
 * chip stays in the composer, so every retry fails identically until the user
 * removes it and re-attaches the file. Kept dependency-free so the node:test
 * suite can import it directly (the toast side lives in `send-error-toast`).
 */
export function isStaleAttachmentError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotFoundError" || err.name === "NotReadableError")
  );
}
