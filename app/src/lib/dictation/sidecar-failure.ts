/**
 * What `transcribe_audio` rejects with, mirroring `DictationError` in
 * `app/src-tauri/src/dictation/types.rs`: a plain string (the sentinels
 * `"model-not-ready"` / `"dictation-unsupported-cpu"`, every setup error) or
 * the `DictationSidecarFailure` object below. Import-free so it loads under
 * the bare Node test runner.
 */

/** The object `transcribe_audio` rejects with when whisper-cli itself failed
 *  (non-zero exit, or killed on timeout), mirroring
 *  `DictationError::SidecarFailure` in `dictation/types.rs`. `message` is the
 *  same text the plain-string rejection used to carry; `stderrTail` is the
 *  end of the sidecar's stderr, where whisper names its crash site
 *  (PRODUCT-1731). */
export interface DictationSidecarFailure {
  kind: "sidecar-failure";
  message: string;
  stderrTail: string;
}

export function isDictationSidecarFailure(
  err: unknown,
): err is DictationSidecarFailure {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as Partial<DictationSidecarFailure>;
  return (
    candidate.kind === "sidecar-failure" &&
    typeof candidate.message === "string" &&
    typeof candidate.stderrTail === "string"
  );
}

/** Tauri rejects with a raw string (Rust's `Err(String)`, e.g. the sentinel
 *  `"model-not-ready"`), a `DictationSidecarFailure` object, or an `Error`;
 *  normalize to plain text. */
export function dictationErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (isDictationSidecarFailure(err)) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Sentry `extra` for a transcription failure: the sidecar's stderr tail when
 *  there is one, so the report shows the crash site next to the exit code. */
export function dictationErrorExtra(
  err: unknown,
): Record<string, string> | undefined {
  if (!isDictationSidecarFailure(err)) return undefined;
  return { whisper_stderr_tail: err.stderrTail || "<empty>" };
}
