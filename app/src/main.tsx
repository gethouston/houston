import {
  Component,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getOrCreateRoot } from "./lib/react-root";
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
import { isBenignLockRejection } from "./lib/benign-rejections";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { runStartupAnalytics } from "./lib/startup-analytics";
import { tauriSystem } from "./lib/tauri";
import { loadTheme } from "./lib/theme";
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
  // Supabase's cross-context auth-refresh lock gets stolen as a normal part of
  // its own recovery; the displaced promise rejects from a timer we can't
  // catch. Not a real error — swallow it instead of toasting + reporting
  // (HOU-435). console.debug only (not the patched console.error) so it never
  // reaches the log file as an error or the user as a toast.
  if (isBenignLockRejection(event.reason)) {
    event.preventDefault();
    console.debug("[global:unhandledrejection] ignored benign Web Locks contention:", message);
    return;
  }
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
const container = document.getElementById("root");
if (!container) {
  // index.html always ships <div id="root">, so a missing node means the
  // document failed to parse. Surface it instead of silently no-op mounting;
  // compat-gate.js's watchdog still paints a friendly fallback (no silent
  // failures).
  throw new Error("Houston UI cannot start: #root is missing from the document");
}
// getOrCreateRoot (not a bare createRoot) so a dev-time re-evaluation of this
// entry module reuses the existing root instead of minting a second one on the
// same #root node — two roots desync the container and crash React with a
// removeChild reconciliation error (HOU-459).
getOrCreateRoot(container).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <StartupEffects>
          <EngineGate>
            <I18nextProvider i18n={i18n}>
              <LanguageGate>
                <DisclaimerGate>
                  <App />
                </DisclaimerGate>
              </LanguageGate>
            </I18nextProvider>
          </EngineGate>
        </StartupEffects>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>,
);
