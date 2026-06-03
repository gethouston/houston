import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import { captureException as sentryCapture } from "./sentry";
import { createSentryReportError } from "./sentry-report-error";

const GREEN_TOAST_DELAY_MS = 700;

/**
 * Surface an error to the user as a toast pair:
 *
 *   1. Red toast — "Houston, we have a problem!" + the error description.
 *      Shown immediately, no action button (auto-report supersedes it).
 *   2. Green follow-up toast — "Houston, we have a solution" + the Sentry
 *      event ID, ~700ms later. Sets expectation that the team sees it.
 *
 * `command` is a short machine-readable tag (e.g. "list_workspaces",
 * "uncaught_error") used as the Sentry tag for triage.
 *
 * Sentry not configured or not flushed → no green toast. Red toast still
 * shown. This is the right behavior for forks / personal builds and for
 * network failures where we cannot honestly say the report was sent.
 */
export function showErrorToast(
  command: string,
  message: string,
  originalError?: unknown,
): void {
  const addToast = useUIStore.getState().addToast;
  analytics.track("app_error_shown", {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });

  addToast({
    title: "Houston, we have a problem!",
    description: message,
    variant: "error",
  });

  const error = createSentryReportError(command, message, originalError);
  void sentryCapture(error, {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).then((eventId) => {
    if (!eventId) return;

    const shortId = eventId.slice(0, 8);
    setTimeout(() => {
      addToast({
        title: "Houston, we have a solution",
        description: `Auto-reported as #${shortId}. We're on it.`,
        variant: "success",
      });
    }, GREEN_TOAST_DELAY_MS);
  }).catch((reportError: unknown) => {
    console.error("[sentry] failed to flush captured error", reportError);
  });
}

export function raiseJavascriptSentrySmokeTest(): never {
  return raiseJavascriptSentrySmokeTestLeaf();
}

function raiseJavascriptSentrySmokeTestLeaf(): never {
  throw new Error(`sentry-js-stack-smoke-${Date.now()}`);
}
