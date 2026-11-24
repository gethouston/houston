/**
 * An upload whose request died mid-flight: the transport gave up before any
 * answer came back. Distinct from the device being offline, which is how every
 * surface used to read it (HOUSTON-APP-5CG): the edge proxy cut any body still
 * uploading at 60 s (Traefik's default `readTimeout`), so a slow attachment
 * failed every retry while the rest of the app answered fine, and the person
 * was told they were offline.
 *
 * Typed so a surface names the upload ("your files didn't finish") and so the
 * report keeps how long the request ran and how big it was, the two numbers
 * that tell a proxy timeout from a dropped connection.
 *
 * A resumable transfer whose retry budget ran out on transport cuts alone
 * (the sink never answered) is the same state and throws this too, with the
 * whole transfer's elapsed time and the last transport message
 * (HOUSTON-APP-5N2).
 *
 * Deliberately NOT chained to the transport `TypeError` as its `cause`: every
 * client's offline classifier unwraps one level of `cause`, and this must not
 * read as offline. The raw transport message rides in this error's message.
 *
 * Dependency-free and erasable-syntax-only: the app's node:test entry points
 * load it through the `@houston/sdk/files/upload-interrupted` subpath.
 */

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
    // A string literal, never `new.target.name`: the production bundle mangles
    // class names and surfaces branch on `err.name`.
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
