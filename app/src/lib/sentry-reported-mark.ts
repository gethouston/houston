/**
 * "This error already reached Sentry" marker, carried on the thrown error.
 *
 * Every engine call goes through `call()` (`lib/tauri.ts`), whose `surfaceError`
 * toasts AND captures by default. Handlers that additionally feed the SAME
 * rejected error to `genericErrorDescription` for their toast body (the
 * create-workspace dialog, the provider connect actions, the provider login
 * dialog) would otherwise file two Sentry issues for one failure. The capture
 * sites in `error-toast.ts` / `error-report.ts` stamp the error; `logAndReportError` reads the stamp
 * and skips the duplicate.
 *
 * Errors from paths that never touch `call()` — a raw `invoke("report_bug")`,
 * clipboard writes, os-bridge calls — are unmarked and still report. That reach
 * is the whole point of HOU-818.
 *
 * `Symbol.for` rather than a private symbol: the web build composes `app/src`
 * through a second module graph, so the global registry keeps one identity.
 */
const REPORTED_TO_SENTRY = Symbol.for("houston.error.reportedToSentry");

/** Record that this error has been captured. No-op for values that can't hold
 *  a marker (string throws, frozen errors) — they simply report twice at worst,
 *  which is the safe direction. */
export function markReportedToSentry(err: unknown): void {
  if (!err || typeof err !== "object" || !Object.isExtensible(err)) return;
  (err as Record<symbol, unknown>)[REPORTED_TO_SENTRY] = true;
}

export function wasReportedToSentry(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as Record<symbol, unknown>)[REPORTED_TO_SENTRY] === true
  );
}
