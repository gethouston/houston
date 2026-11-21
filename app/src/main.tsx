import { TooltipProvider } from "@houston-ai/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { Component, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { useProductAnalyticsSink } from "./hooks/use-product-analytics-sink";
import { useUsageAccrual } from "./hooks/use-usage-accrual";
import { IdentityKeyedApp } from "./identity-keyed-app";
import { queryClient } from "./lib/query-client";
import "./styles/globals.css";
import { EngineGate } from "./components/shell/engine-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { QueryPersistenceProvider } from "./components/shell/query-persistence-provider";
import { analytics, classifyAnalyticsError } from "./lib/analytics";
import { whenEngineReady } from "./lib/engine";
import { showErrorToast } from "./lib/error-toast";
import { installGlobalErrorHandlers } from "./lib/global-error-handlers";
import i18n from "./lib/i18n";
import { initFrontendLogging, logger } from "./lib/logger";
import { osOpenUrl } from "./lib/os-bridge";
import { initSentry } from "./lib/sentry";
import { installSentrySmokeShortcuts } from "./lib/sentry-smoke";
import { runStartupAnalytics } from "./lib/startup-analytics";
import { loadThemePreference } from "./lib/theme";
import { applyBootTheme } from "./lib/theme-boot";

initSentry();
if (import.meta.env.DEV) {
  installSentrySmokeShortcuts();
}

initFrontendLogging();

installGlobalErrorHandlers();

applyBootTheme();

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

function StartupEffects({ children }: { children: ReactNode }) {
  useUsageAccrual();
  useProductAnalyticsSink();
  useEffect(() => {
    let cancelled = false;
    void whenEngineReady().then(() => {
      if (cancelled) return;
      void runStartupAnalytics(analytics, osOpenUrl);
      void loadThemePreference();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return <>{children}</>;
}

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
                  <IdentityKeyedApp />
                </LanguageGate>
              </QueryPersistenceProvider>
            </EngineGate>
          </StartupEffects>
        </TooltipProvider>
      </ErrorBoundary>
    </I18nextProvider>
  </QueryClientProvider>,
);
