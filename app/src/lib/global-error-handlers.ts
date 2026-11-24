import { setAdapterErrorSink } from "@houston/engine-adapter";
import { isAgentWarmingError } from "./agent-warming-guard";
import { analytics, classifyAnalyticsError } from "./analytics";
import {
  isBenignAbortRejection,
  isBenignLockRejection,
} from "./benign-rejections";
import { isStayOpenSignal } from "./dialog-stay-open";
import { logAndReportError } from "./error-report";
import {
  showConnectivityErrorToast,
  showEngineWakingToast,
  showErrorToast,
} from "./error-toast";
import { installForeignDomSafetyNet } from "./foreign-dom-report";
import { isNetworkTransportError } from "./network-transport-error";
import { classifyQuietError } from "./quiet-error-class";

export function installGlobalErrorHandlers(): void {
  installForeignDomSafetyNet();
  setAdapterErrorSink(logAndReportError);
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
    if (isBenignLockRejection(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] ignored benign Web Locks contention:",
        message,
      );
      return;
    }
    if (isBenignAbortRejection(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] ignored WebKit fetch-abort teardown noise:",
        message,
      );
      return;
    }
    if (isStayOpenSignal(event.reason)) {
      event.preventDefault();
      return;
    }
    if (isAgentWarmingError(event.reason)) {
      event.preventDefault();
      console.debug(
        "[global:unhandledrejection] write blocked while the agent warms up:",
        message,
      );
      return;
    }
    if (isNetworkTransportError(event.reason)) {
      event.preventDefault();
      console.error("[global:unhandledrejection] connectivity drop:", message);
      showConnectivityErrorToast("unhandled_rejection", message, event.reason);
      return;
    }
    const quiet = classifyQuietError(event.reason);
    if (quiet === "compute_busy" || quiet === "conversation_edit_refused") {
      event.preventDefault();
      showErrorToast("unhandled_rejection", message, event.reason);
      return;
    }
    if (quiet === "engine_waking") {
      event.preventDefault();
      console.error("[global:unhandledrejection] engine waking:", message);
      showEngineWakingToast("unhandled_rejection", message, event.reason);
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
