import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import i18n from "./i18n";
import {
  captureException as sentryCapture,
  sentrySuppressedInDev,
} from "./sentry";
import { devNoSendToastSpec } from "./sentry-dev";
import { createSentryReportError } from "./sentry-report-error";

const GREEN_TOAST_DELAY_MS = 700;

/**
 * Capture an error to Sentry WITHOUT showing a toast. For engine-call paths
 * that surface the failure with their own inline UI (a toast would be
 * redundant) but must still reach Sentry — the report is what lets us fix it.
 * Capture is decoupled from the toast so `{ toast: false }` callers aren't
 * silently invisible to crash reporting. Returns immediately; flush failures
 * are logged, never thrown.
 */
export function reportError(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  const error = createSentryReportError(command, message, originalError);
  void sentryCapture(error, {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}

/**
 * Surface an error to the user as a toast pair:
 *
 *   1. Red toast — the branded "we have a problem" title + the error itself.
 *      Shown immediately, no action button (auto-report supersedes it).
 *   2. Green follow-up toast — "report sent" + the Sentry event ID, ~700ms
 *      later, with a "Copy code" action that copies the FULL event id so it
 *      can be quoted to support / looked up in Sentry.
 *
 * Copy deliberately exposes the whole 32-char id (the toast text shows the
 * short prefix for readability). The wording is "report sent" — an honest
 * "the envelope left the queue" claim, NOT "we have a solution": the flush
 * confirms the transport accepted it, not that Sentry ingested or triaged it.
 *
 * `command` is a short machine-readable tag (e.g. "list_workspaces",
 * "uncaught_error") used as the Sentry tag for triage.
 *
 * Sentry not configured or not flushed → no green toast. Red toast still
 * shown. This is the right behavior for forks / personal builds and for
 * network failures where we cannot honestly say the report was sent.
 *
 * A message identical to one toasted moments ago is deduped (toast pair
 * skipped, Sentry capture kept): one root cause failing N concurrent calls —
 * a dozen queries all hitting the same rejected bearer during a cloud deploy
 * (HOU-687) — must read as ONE problem, not a toast storm.
 */
const TOAST_DEDUPE_WINDOW_MS = 5_000;
const recentToasts = new Map<string, number>();

function isDuplicateToast(message: string, now: number): boolean {
  const last = recentToasts.get(message);
  recentToasts.set(message, now);
  // The map only ever holds messages from the current burst — evict as we go.
  for (const [msg, at] of recentToasts) {
    if (now - at > TOAST_DEDUPE_WINDOW_MS) recentToasts.delete(msg);
  }
  return last !== undefined && now - last <= TOAST_DEDUPE_WINDOW_MS;
}

export function showErrorToast(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  const addToast = useUIStore.getState().addToast;

  if (isDuplicateToast(message, Date.now())) {
    // Still worth the report (Sentry dedupes server-side); just not a second
    // identical red toast within the window. The analytics event, though, tracks
    // a SHOWN toast — so it fires only past the dedupe, else N concurrent calls
    // failing on one root cause (HOU-687) would N-count a single problem.
    const error = createSentryReportError(command, message, originalError);
    if (!sentrySuppressedInDev) {
      void sentryCapture(error, {
        source: command,
        error_kind: classifyAnalyticsError(message),
      }).catch((flushErr: unknown) => {
        console.error("[sentry] failed to flush captured error", flushErr);
      });
    }
    return;
  }

  analytics.track("app_error_shown", {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });

  addToast({
    title: i18n.t("shell:errorToast.problemTitle"),
    description: message,
    variant: "error",
  });

  // Dev build with Sentry suppressed: don't capture (initSentry already bailed),
  // and replace the green "report sent" toast with a dev-only notice so the
  // developer knows the error stayed local and how to opt into sending.
  if (sentrySuppressedInDev) {
    setTimeout(() => {
      addToast(devNoSendToastSpec());
    }, GREEN_TOAST_DELAY_MS);
    return;
  }

  const error = createSentryReportError(command, message, originalError);
  void sentryCapture(error, {
    source: command,
    error_kind: classifyAnalyticsError(message),
  })
    .then((eventId) => {
      if (!eventId) return;

      const shortId = eventId.slice(0, 8);
      setTimeout(() => {
        addToast({
          title: i18n.t("shell:errorToast.reportSentTitle"),
          description: i18n.t("shell:errorToast.reportSentDescription", {
            id: shortId,
          }),
          variant: "success",
          action: {
            label: i18n.t("shell:errorToast.copyId"),
            onClick: () => {
              void navigator.clipboard
                .writeText(eventId)
                .catch((copyErr: unknown) =>
                  console.error("[sentry] copy event id failed", copyErr),
                );
            },
          },
        });
      }, GREEN_TOAST_DELAY_MS);
    })
    .catch((flushErr: unknown) => {
      console.error("[sentry] failed to flush captured error", flushErr);
    });
}

export function raiseJavascriptSentrySmokeTest(): never {
  return raiseJavascriptSentrySmokeTestLeaf();
}

function raiseJavascriptSentrySmokeTestLeaf(): never {
  throw new Error(`sentry-js-stack-smoke-${Date.now()}`);
}
