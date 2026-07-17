import { TooltipProvider } from "@houston-ai/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import { queryClient } from "./lib/query-client";
import "./styles/globals.css";
import { AgentFilePreviewHost } from "./components/agent-file-preview-host";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { EngineGate } from "./components/shell/engine-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { QueryPersistenceProvider } from "./components/shell/query-persistence-provider";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { whenEngineReady } from "./lib/engine";
import { showErrorToast } from "./lib/error-toast";
import { installGlobalErrorHandlers } from "./lib/global-error-handlers";
import i18n from "./lib/i18n";
import { initFrontendLogging, logger } from "./lib/logger";
import { initSentry } from "./lib/sentry";
import { installSentrySmokeShortcuts } from "./lib/sentry-smoke";
import { runStartupAnalytics } from "./lib/startup-analytics";
import { tauriSystem } from "./lib/tauri";
import { loadTheme } from "./lib/theme";

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
 * Install-lifecycle + theme bootstrap, mounted ABOVE the language/disclaimer
 * gates. Emits `install_created` and runs `posthog.identify(install_id)` BEFORE
 * any `onboarding_*` event so the sequential acquisition→activation funnel
 * (keyed on `install_created` as step 1) doesn't break at step 2. The gates
 * short-circuit `<App/>` on a fresh install, so analytics.init() can't live in
 * App's mount effect — it would fire after the gate events. See
 * `runStartupAnalytics`. Renders children immediately; never blocks.
 */
function StartupEffects({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Wait for the engine handshake before touching engine-backed preferences.
    // `install_id`, the first-install vintage, the daily-active date, and the
    // theme all read through `tauriPreferences -> getEngine()`, which THROWS
    // until the handshake lands. Running before then would have getInstallId
    // swallow the failure, mint a fresh id, and re-fire `install_created` (and
    // re-open the /welcome bridge) on every launch — churning identity. The
    // race is widest on Windows, where the sidecar spawns slowest. Gating here
    // restores the original "engine-ready" precondition (these used to run in
    // App's mount effect, below <EngineGate>) while still emitting
    // `install_created` BEFORE the language/disclaimer gates — they render
    // inside <EngineGate>, i.e. only once this same handshake resolves.
    let cancelled = false;
    void whenEngineReady().then(() => {
      if (cancelled) return;
      void runStartupAnalytics(analytics, (url) => tauriSystem.openUrl(url));
      void loadTheme();
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <TooltipProvider>
          <StartupEffects>
            <EngineGate>
              <QueryPersistenceProvider>
                <LanguageGate>
                  <DisclaimerGate>
                    <App />
                    {/* Global workspace-file preview (chat file clicks) — a
                        sibling of App so it overlays every screen, onboarding
                        included. Mirrored in packages/web/src/app-tree.tsx. */}
                    <AgentFilePreviewHost />
                  </DisclaimerGate>
                </LanguageGate>
              </QueryPersistenceProvider>
            </EngineGate>
          </StartupEffects>
        </TooltipProvider>
      </ErrorBoundary>
    </I18nextProvider>
  </QueryClientProvider>,
);
