import { isAgentWarmingError } from "./agent-warming-guard";
import { analytics, classifyAnalyticsError } from "./analytics";
import {
  isBenignAbortRejection,
  isBenignLockRejection,
} from "./benign-rejections";
import { isEngineWakingError } from "./engine-waking-error";
import {
  showConnectivityErrorToast,
  showEngineWakingToast,
  showErrorToast,
} from "./error-toast";
import { isNetworkTransportError } from "./network-transport-error";

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
    // WebKit rejects an unreachable internal promise when a locked fetch body
    // is aborted — fired by our own deliberate stream teardown (PRODUCT-1436).
    // Not a failure: same posture as the lock guard above, console.debug only.
    if (isBenignAbortRejection(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] ignored WebKit fetch-abort teardown noise:",
        message,
      );
      return;
    }
    // A write blocked while the agent's engine warms up (HOU-693) already
    // surfaced as the "almost ready" dialog; most submit handlers don't catch,
    // so the typed rejection lands here — handled, not a bug.
    if (isAgentWarmingError(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] write blocked while the agent warms up:",
        message,
      );
      return;
    }
    // A transport-level network failure whose rejected promise nobody caught
    // (PRODUCT-1392: the `/v1/events` global stream dropping on device
    // offline / sleep-wake). Same HOU-1085 policy as the engine-call and
    // caller-toast layers — ONE deduped connectivity toast, no Sentry capture:
    // nothing in Houston broke. This handler was the last ungated surface, and
    // it kept the `unhandled_rejection: Load failed` Sentry family alive after
    // both other layers were gated. console.error (patched) so the drop still
    // reaches the log file; the toast fires the analytics event past dedupe.
    if (isNetworkTransportError(event.reason)) {
      event.preventDefault();
      console.error("[global:unhandledrejection] connectivity drop:", message);
      showConnectivityErrorToast("unhandled_rejection", message);
      return;
    }
    // A gateway "the agent's pod is not there right now" answer whose rejected
    // promise nobody caught (HOUSTON-APP-51C: the mission-approve write hitting
    // a pod mid engine-roll). The engine-call layer classifies the same failure
    // as a waking state and shows the deduped waking toast, but `call` rethrows
    // and card handlers deliberately don't catch — so it landed here, the last
    // ungated surface, and was re-captured as `unhandled_rejection: engine
    // proxy failed (engine error 502)`. Same policy as tauri.ts: one waking
    // notice, no Sentry capture — nothing in Houston broke, the write succeeds
    // on retry once the pod listens again.
    if (isEngineWakingError(event.reason)) {
      event.preventDefault();
      console.error("[global:unhandledrejection] engine waking:", message);
      showEngineWakingToast("unhandled_rejection", message);
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
