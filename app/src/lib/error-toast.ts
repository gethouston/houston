import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import { captureException as sentryCapture } from "./sentry";

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
 * Sentry not configured (no DSN baked) → no green toast, no follow-up. Red
 * toast still shown. This is the right behavior for forks / personal builds.
 */
export function showErrorToast(command: string, message: string): void {
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

  // Promote the toast-call sites that don't already pass a real Error into
  // a synthetic one so Sentry has a non-empty stack frame. `command` becomes
  // the issue name in Sentry — that's the dedup fingerprint.
  const error = new Error(message);
  error.name = command;
  const eventId = sentryCapture(error, {
    source: command,
    error_kind: classifyAnalyticsError(message),
  });

  if (!eventId) return;

  const shortId = eventId.slice(0, 8);
  setTimeout(() => {
    addToast({
      title: "Houston, we have a solution",
      description: `Auto-reported as #${shortId}. We're on it.`,
      variant: "success",
    });
  }, GREEN_TOAST_DELAY_MS);
}
