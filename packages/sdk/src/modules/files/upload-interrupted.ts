export type UploadRoute = "attachments" | "files_import" | "migration_import";

export const UPLOAD_INTERRUPTED_NAME = "UploadInterruptedError";

export class UploadInterruptedError extends Error {
  readonly route: UploadRoute;
  readonly fileBytes: number;
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

export function isUploadInterruptedError(
  err: unknown,
): err is UploadInterruptedError {
  return err instanceof Error && err.name === UPLOAD_INTERRUPTED_NAME;
}
