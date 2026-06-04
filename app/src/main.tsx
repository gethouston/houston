import {
  Component,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@houston-ai/core";
import { queryClient } from "./lib/query-client";
import App from "./App";
import "./styles/globals.css";
import { initFrontendLogging, logger } from "./lib/logger";
import {
  whenEngineReady,
  isEngineReady,
  onEngineFailed,
  type EngineFailure,
} from "./lib/engine";
import { reportBug } from "./lib/bug-report";
import i18n from "./lib/i18n";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { showErrorToast } from "./lib/error-toast";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { initSentry } from "./lib/sentry";
import { installSentrySmokeShortcuts } from "./lib/sentry-smoke";

// Sentry first so global error handlers below can capture into it from the
// very first render. Empty DSN → silent no-op (dev / forks).
initSentry();
installSentrySmokeShortcuts();

// Initialize file-based logging — patches console.error/warn to write to
// ~/.houston/logs/frontend.log (or ~/.dev-houston/logs/frontend.log in dev).
initFrontendLogging();

// Global error handlers — surface ALL uncaught errors as toasts
// (console.error calls here also flow to the log file via initFrontendLogging)
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
  console.error("[global:unhandledrejection]", message, event.reason);
  analytics.captureException(event.reason, {
    source: "unhandled_rejection",
    error_kind: classifyAnalyticsError(message),
  });
  showErrorToast("unhandled_rejection", message, event.reason);
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    logger.error(`[react-crash] ${error.message}`, error.stack);
    analytics.captureException(error, {
      source: "react_crash",
      error_kind: classifyAnalyticsError(error.message),
    });
    showErrorToast("react_crash", error.message, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            padding: 32,
            background: "#1e1e1e",
            color: "#ffdddd",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            zIndex: 999999,
          }}
        >
          <h1 style={{ color: "#ff6666", fontSize: 24, margin: 0, marginBottom: 16 }}>
            App crashed
          </h1>
          <p style={{ fontSize: 15, marginBottom: 16, color: "#ffffff" }}>
            {this.state.error.message}
          </p>
          <pre style={{ fontSize: 12, opacity: 0.85 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Blocks the app from rendering until the Tauri supervisor emits
 * `houston-engine-ready` (or the injection raced in early). Hooks deep in
 * the tree synchronously call `getEngine()` in their first useEffect, so
 * we MUST have the handshake before mounting <App />.
 */
function EngineGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isEngineReady());
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    whenEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    // The supervisor brings the engine up on a worker thread, so a startup
    // failure arrives as an event rather than a crash. Surface it instead of
    // spinning on the splash forever.
    const unsubscribe = onEngineFailed((f) => {
      if (!cancelled) setFailure(f);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ready]);

  // Locale resolution lives in <LanguageGate>: it resolves the effective
  // locale from the engine (active workspace override → global preference),
  // applies it to the live i18n instance, and handles the first-run picker.
  // That gate sits inside <I18nextProvider> and owns the full locale story —
  // the engine, not localStorage, is the source of truth.

  // A late `houston-engine-ready` can still win after a failure (e.g. the
  // supervisor's restart loop recovered), so `ready` takes precedence.
  if (failure && !ready) {
    return <EngineStartupError reason={failure.reason} />;
  }

  if (!ready) {
    // Use the i18n singleton directly — this renders OUTSIDE
    // <I18nextProvider>, so useTranslation would have no context.
    // The singleton is already initialized synchronously in i18n.ts.
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#888",
          fontSize: 14,
        }}
      >
        {i18n.t("shell:engineGate.starting")}
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Shown when the Tauri supervisor reports it could not start the engine
 * (`houston-engine-failed`). Renders OUTSIDE <I18nextProvider> and the toast
 * provider, so it uses the i18n singleton directly and a self-contained
 * Report-bug button rather than the shared toast/Button primitives.
 *
 * The raw `reason` is never shown to the user — it can carry technical engine
 * detail the product voice forbids surfacing — it travels only inside the bug
 * report (whose payload also bundles the recent engine + app log tail).
 */
function EngineStartupError({ reason }: { reason: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  const handleReport = () => {
    if (status === "sending" || status === "sent") return;
    setStatus("sending");
    reportBug({
      command: "engine_startup_failed",
      error: reason,
      userEmail: null,
      timestamp: new Date().toISOString(),
      appVersion: __APP_VERSION__,
    })
      .then(() => setStatus("sent"))
      .catch((err) => {
        console.error("[engine] startup-failure bug report failed", err);
        setStatus("error");
      });
  };

  const buttonLabel =
    status === "sending"
      ? i18n.t("shell:engineGate.reporting")
      : status === "sent"
        ? i18n.t("shell:engineGate.reportSent")
        : i18n.t("shell:engineGate.reportBug");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height: "100vh",
        padding: 32,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: "#333" }}>
        {i18n.t("shell:engineGate.failedTitle")}
      </div>
      <p
        style={{
          fontSize: 14,
          color: "#666",
          maxWidth: 360,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {i18n.t("shell:engineGate.failedBody")}
      </p>
      <button
        type="button"
        onClick={handleReport}
        disabled={status === "sending" || status === "sent"}
        style={{
          marginTop: 4,
          padding: "8px 16px",
          borderRadius: 9999,
          border: "1px solid #d0d0d0",
          background: "#fff",
          color: "#333",
          fontSize: 13,
          cursor:
            status === "sending" || status === "sent" ? "default" : "pointer",
        }}
      >
        {buttonLabel}
      </button>
      {status === "error" && (
        <p style={{ fontSize: 12, color: "#c0392b", margin: 0 }}>
          {i18n.t("shell:engineGate.reportFailed")}
        </p>
      )}
    </div>
  );
}

// StrictMode intentionally remounts components to catch bugs. In Tauri's
// WKWebView that double-mount collides with portal DOM + Tauri event
// listeners and throws NotFoundError on removeChild. Skipping it for now;
// revisit once the underlying portal/listener churn is fixed.
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <EngineGate>
          <I18nextProvider i18n={i18n}>
            <LanguageGate>
              <DisclaimerGate>
                <App />
              </DisclaimerGate>
            </LanguageGate>
          </I18nextProvider>
        </EngineGate>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>,
);
