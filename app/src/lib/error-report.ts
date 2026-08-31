import { classifyAnalyticsError } from "./analytics";
import { isEngineWakingError } from "./engine-waking-error";
import i18n from "./i18n";
import { isNetworkTransportError } from "./network-transport-error";
import { captureException as sentryCapture } from "./sentry";
import { createSentryReportError } from "./sentry-report-error";
import {
  markReportedToSentry,
  wasReportedToSentry,
} from "./sentry-reported-mark";

/**
 * Capture an error to Sentry WITHOUT showing a toast. For engine-call paths
 * that surface the failure with their own inline UI (a toast would be
 * redundant) but must still reach Sentry — the report is what lets us fix it.
 * Capture is decoupled from the toast so `{ toast: false }` callers aren't
 * silently invisible to crash reporting. Returns immediately; flush failures
 * are logged, never thrown.
 *
 * Two classes are NOT captured, both expected environment states the
 * engine-call layer already classifies and declines, where this layer
 * re-capturing kept a Sentry family alive:
 *  - transport-level network failures (device offline / host unreachable —
 *    HOU-1085; HOUSTON-APP-4PQ, PRODUCT-1383 was this layer's leak);
 *  - gateway waking answers (engine pod provisioning / restarting under a
 *    roll — HOU-1114, PRODUCT-1403; same one-layer-left failure mode as
 *    HOUSTON-APP-51C in the global rejection handler).
 * The raw diagnostic still reaches the frontend log via the caller's
 * `console.error`.
 */
export function reportError(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  if (isNetworkTransportError(originalError)) return;
  if (isEngineWakingError(originalError)) return;
  markReportedToSentry(originalError);
  const error = createSentryReportError(command, message, originalError);
  void sentryCapture(error, {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}

/**
 * Log a failed user action to the frontend log AND report it to Sentry, with
 * no toast of its own. For handlers that surface the failure with their OWN
 * authored copy: the user reads the product wording, we still get the report.
 * A console.error alone (the old shape of these catch blocks) meant a whole
 * class of user-visible failures — bug-report submissions above all — never
 * reached crash reporting, so we only learned about them by being told.
 *
 * An error the engine-call layer already captured (see `sentry-reported-mark`)
 * is still logged here — this handler's `command` is the context the engine
 * label lacks — but NOT captured again: one failure, one Sentry issue.
 */
export function logAndReportError(command: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[${command}] ${raw}`);
  if (wasReportedToSentry(err)) return;
  reportError(command, raw, err);
}

/**
 * Localized generic body for an ad-hoc error toast whose title already names
 * the failed action. Logs the raw diagnostic and reports it (console.error is
 * mirrored to the frontend log) so the friendlier copy never costs us the
 * detail — nor the Sentry issue.
 */
export function genericErrorDescription(command: string, err: unknown): string {
  logAndReportError(command, err);
  return i18n.t("shell:errorToast.genericDescription");
}
