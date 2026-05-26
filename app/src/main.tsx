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
import { whenEngineReady, isEngineReady } from "./lib/engine";
import i18n from "./lib/i18n";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { showErrorToast } from "./lib/error-toast";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { initSentry, captureException as sentryCapture } from "./lib/sentry";

// Sentry first so global error handlers below can capture into it from the
// very first render. Empty DSN → silent no-op (dev / forks).
initSentry();

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
  sentryCapture(err, { source: "uncaught_error" });
  showErrorToast("uncaught_error", message);
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const message = event.reason?.message ?? String(event.reason);
  console.error("[global:unhandledrejection]", message, event.reason);
  analytics.captureException(event.reason, {
    source: "unhandled_rejection",
    error_kind: classifyAnalyticsError(message),
  });
  sentryCapture(event.reason, { source: "unhandled_rejection" });
  showErrorToast("unhandled_rejection", message);
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
    sentryCapture(error, { source: "react_crash" });
    showErrorToast("react_crash", error.message);
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
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    whenEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Locale resolution moved to <LanguageGate>, which both reads the
  // persisted pref and handles the first-run picker. That gate sits
  // inside <I18nextProvider> and owns the full locale story.

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
