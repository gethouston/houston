import { showErrorToast } from "./error-toast";
import { analytics, classifyAnalyticsError } from "./analytics";
import { isBenignLockRejection } from "./benign-rejections";

/**
 * Install the process-wide `window.onerror` / `window.onunhandledrejection`
 * handlers that surface uncaught errors as toasts + analytics/Sentry reports.
 *
 * Shared by BOTH app entries — the desktop `app/src/main.tsx` and the web
 * `packages/web/src/app-tree.tsx` render the same tree and must report errors
 * identically, so the handler body lives here instead of being copy-pasted into
 * each (the two copies previously drifted; the benign Web Locks guard below is
 * exactly the kind of fix that otherwise has to be applied twice).
 *
 * Call this AFTER `initFrontendLogging()`: that patch wraps `console.error` to
 * also write the log file, so the `console.error` calls below land in the log,
 * while the benign branch's `console.debug` (intentionally NOT patched) stays
 * out of both the log file and the user's face.
 */
export function installGlobalErrorHandlers(): void {
  window.onerror = (_event, _source, _line, _col, error) => {
    const message = error?.message ?? String(_event);
    console.error("[global:error]", message, error);
    const err = error ?? new Error(message);
    analytics.captureException(err, {
      source: "uncaught_error",
      error_kind: classifyAnalyticsError(message),
    });
    showErrorToast("uncaught_error", message, err);
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const message = event.reason?.message ?? String(event.reason);
    // Supabase's cross-context auth-refresh lock gets stolen as a normal part
    // of its own recovery; the displaced promise rejects from a timer we can't
    // catch. Not a real error — swallow it instead of toasting + reporting
    // (HOU-435). console.debug only (not the patched console.error) so it never
    // reaches the log file as an error or the user as a toast.
    if (isBenignLockRejection(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] ignored benign Web Locks contention:",
        message,
      );
      return;
    }
    console.error("[global:unhandledrejection]", message, event.reason);
    analytics.captureException(event.reason, {
      source: "unhandled_rejection",
      error_kind: classifyAnalyticsError(message),
    });
    showErrorToast("unhandled_rejection", message, event.reason);
  };
}
