import { TooltipProvider } from "@houston-ai/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import { queryClient } from "./lib/query-client";
import "./styles/globals.css";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { isEngineReady, whenEngineReady } from "./lib/engine";
import { showErrorToast } from "./lib/error-toast";
import { installGlobalErrorHandlers } from "./lib/global-error-handlers";
import i18n from "./lib/i18n";
import { initFrontendLogging, logger } from "./lib/logger";
import { initSentry } from "./lib/sentry";
import { installSentrySmokeShortcuts } from "./lib/sentry-smoke";

// Sentry first so global error handlers below can capture into it from the
// very first render. Empty DSN → silent no-op (dev / forks).
initSentry();
// Sentry smoke-test triggers (Ctrl+Alt+Shift+J/N + the __HOUSTON_SENTRY_SMOKE__
// global) are DEV-ONLY. Houston is open source and official release binaries
// bake the prod SENTRY_DSN, so shipping these error-injectors would let anyone
// flood the prod Sentry project. The `import.meta.env.DEV` guard is statically
// false in production builds, so Vite tree-shakes the call + the module away.
// To re-verify symbolication on a SIGNED build, temporarily drop this guard.
if (import.meta.env.DEV) {
  installSentrySmokeShortcuts();
}

// Initialize file-based logging — patches console.error/warn to write to
// ~/.houston/logs/frontend.log (or ~/.dev-houston/logs/frontend.log in dev).
initFrontendLogging();

// Global error handlers — surface uncaught errors as toasts + reports, while
// swallowing benign background noise (Supabase Web Locks steal, HOU-435). Body
// is shared with the web entry (packages/web/src/app-tree.tsx) so the two trees
// can't drift. Must run AFTER initFrontendLogging() so the console.error → log
// file patch is already in place.
installGlobalErrorHandlers();

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

  // Locale resolution lives in <LanguageGate>: it resolves the effective
  // locale from the engine (active workspace override → global preference),
  // applies it to the live i18n instance, and handles the first-run picker.
  // That gate sits inside <I18nextProvider> and owns the full locale story —
  // the engine, not localStorage, is the source of truth.

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
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in DOM");
}
createRoot(rootElement).render(
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
