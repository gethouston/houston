import * as Sentry from "@sentry/browser";

/**
 * Low-noise Sentry captures for the error-surfacing layer's quiet classes
 * (PRODUCT-1640). Split from `sentry.ts` because these are a different
 * contract from `captureException` there: that one confirms delivery (it
 * flushes and waits for the 2xx, the price of the old "report sent" toast),
 * this one is fire-and-forget, and — the point — it FIXES the grouping. A
 * fingerprint of one constant per class makes the whole class ONE issue with
 * a count, so a deploy roll that fails hundreds of reads across the fleet
 * adds events to that issue and never files a new one. The raw gateway body
 * rides as `extra`, where Sentry's event search can still find it.
 *
 * No-op until `initSentry` ran (dev builds without the send-in-dev opt-in,
 * forks with no DSN), same as every other capture.
 */
export interface QuietCaptureOptions {
  /** `Sentry.captureException` level: warning for the classes themselves,
   *  error for the stuck-wake escalation. */
  level: "warning" | "error";
  /** Constant grouping key(s): the class name, never per-event data. */
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

export function captureQuietEvent(
  error: Error,
  options: QuietCaptureOptions,
): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, {
    level: options.level,
    fingerprint: options.fingerprint,
    tags: options.tags,
    extra: options.extra,
  });
}
