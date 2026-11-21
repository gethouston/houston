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

export function dictationErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (isDictationSidecarFailure(err)) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function dictationErrorExtra(
  err: unknown,
): Record<string, string> | undefined {
  if (!isDictationSidecarFailure(err)) return undefined;
  return { whisper_stderr_tail: err.stderrTail || "<empty>" };
}
