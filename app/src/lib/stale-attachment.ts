export function isStaleAttachmentError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "NotFoundError" || err.name === "NotReadableError")
  );
}
