/**
 * The Houston app tree, composed for the web.
 *
 * This mirrors app/src/main.tsx's provider/gate nesting but is web-owned so it
 * can be lazy-loaded only after the engine config is in place (see root.tsx).
 * It imports the REAL app components from app/src (via the `@houston/app/*`
 * alias) — no fork. The only platform difference is reached through the Tauri
 * shims (vite.config.ts), so behavior matches the desktop app except where a
 * capability genuinely can't exist in a browser.
 *
 * Boot order matches the desktop entry:
 *   QueryClientProvider > ErrorBoundary > TooltipProvider > EngineGate >
 *   I18nextProvider > LanguageGate > DisclaimerGate > App
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@houston-ai/core";

import { queryClient } from "@houston/app/lib/query-client";
import App from "@houston/app/App";
import i18n from "@houston/app/lib/i18n";
import { LanguageGate } from "@houston/app/components/shell/language-gate";
import { DisclaimerGate } from "@houston/app/components/shell/disclaimer-gate";
import { whenEngineReady, isEngineReady } from "@houston/app/lib/engine";
import { initFrontendLogging, logger } from "@houston/app/lib/logger";
import { initSentry } from "@houston/app/lib/sentry";
import { showErrorToast } from "@houston/app/lib/error-toast";
import { analytics, classifyAnalyticsError } from "@houston/app/lib/analytics";
import "@houston/app/styles/globals.css";

// Sentry first so the global handlers below can capture from the first render.
// Empty DSN (the default web build) → silent no-op.
initSentry();

// Patches console.error/warn + window handlers. On web the underlying
// write_frontend_log is a no-op shim, so this is harmless (console only).
initFrontendLogging();

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

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
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
          <h1
            style={{
              color: "#ff6666",
              fontSize: 24,
              margin: 0,
              marginBottom: 16,
            }}
          >
            App crashed
          </h1>
          <p style={{ fontSize: 15, marginBottom: 16, color: "#ffffff" }}>
            {this.state.error.message}
          </p>
          <pre style={{ fontSize: 12, opacity: 0.85 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Blocks render until the engine client is bootstrapped. On web the handshake
 * is set synchronously (window.__HOUSTON_ENGINE__) before this chunk loads, so
 * this resolves on the first tick — but we keep the gate for parity and for the
 * (defensive) restart-rebuild path in engine.ts.
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

  if (!ready) {
    // Rendered OUTSIDE <I18nextProvider>; use the i18n singleton directly.
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

// No StrictMode — matches app/src/main.tsx (portal/listener double-mount churn).
export default function AppTree() {
  return (
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
    </QueryClientProvider>
  );
}
