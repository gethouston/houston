/** Which upload route the interrupted request was posting to. */
export type UploadRoute = "attachments" | "files_import" | "migration_import";

export const UPLOAD_INTERRUPTED_NAME = "UploadInterruptedError";

export class UploadInterruptedError extends Error {
  readonly route: UploadRoute;
  /** Decoded size of the files the request carried. */
  readonly fileBytes: number;
  /** From the first send to the transport giving up, including any
   *  compute-refusal re-send pauses `httpRequest` rode out before it. */
  readonly elapsedMs: number;

  constructor(
    route: UploadRoute,
    fileBytes: number,
    elapsedMs: number,
    transportMessage: string,
  ) {
    super(
      `upload interrupted (${route}) after ${(elapsedMs / 1000).toFixed(1)} s, ${fileBytes} file bytes: ${transportMessage}`,
    );
    this.name = UPLOAD_INTERRUPTED_NAME;
    this.route = route;
    this.fileBytes = fileBytes;
    this.elapsedMs = elapsedMs;
  }
}

/** Whether `err` is an upload the transport cut before any answer came back. */
export function isUploadInterruptedError(
  err: unknown,
): err is UploadInterruptedError {
  return err instanceof Error && err.name === UPLOAD_INTERRUPTED_NAME;
}
