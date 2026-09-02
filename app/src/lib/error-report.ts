import { classifyAnalyticsError } from "./analytics";
import i18n from "./i18n";
import { classifyQuietError } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";
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
 * Two classes take the LOW-NOISE path instead of a per-event capture, both
 * expected environment states the engine-call layer already classifies:
 *  - transport-level network failures (device offline / host unreachable —
 *    HOU-1085; HOUSTON-APP-4PQ, PRODUCT-1383 was this layer's leak);
 *  - gateway waking answers (engine pod provisioning / restarting under a
 *    roll — HOU-1114, PRODUCT-1403; same one-layer-left failure mode as
 *    HOUSTON-APP-51C in the global rejection handler).
 * Declining them outright (the PRODUCT-1446 policy) kept deploy-day bursts
 * from filing hundreds of issues, but it also meant a raw gateway body a user
 * never saw existed only in their local log (PRODUCT-1640). They now capture
 * as a burst-collapsed warning in ONE fingerprinted issue per class, via
 * `reportQuietError`, which can never file a new issue per event.
 */
export function reportError(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  const quiet = classifyQuietError(originalError);
  if (quiet) {
    reportQuietError(quiet, command, message, originalError);
    return;
  }
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
