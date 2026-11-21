import { LanguageGate } from "@houston/app/components/shell/language-gate";
import { QueryPersistenceProvider } from "@houston/app/components/shell/query-persistence-provider";
import { WorkspaceLoading } from "@houston/app/components/shell/workspace-loading";
import { useLocalePreference } from "@houston/app/hooks/use-locale-preference";
import { useSession } from "@houston/app/hooks/use-session";
import { useUsageAccrual } from "@houston/app/hooks/use-usage-accrual";
import { IdentityKeyedApp } from "@houston/app/identity-keyed-app";
import { isEngineReady, whenEngineReady } from "@houston/app/lib/engine";
import { installGlobalErrorHandlers } from "@houston/app/lib/global-error-handlers";
import i18n from "@houston/app/lib/i18n";
import { isIdentityConfigured } from "@houston/app/lib/identity";
import { initFrontendLogging } from "@houston/app/lib/logger";
import { queryClient } from "@houston/app/lib/query-client";
import { initSentry } from "@houston/app/lib/sentry";
import { loadThemePreference } from "@houston/app/lib/theme";
import { TooltipProvider } from "@houston-ai/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { ErrorBoundary } from "./app-error-boundary";
import {
  ProductAnalyticsSinkMount,
  WebSessionStartMount,
} from "./boot-analytics";
import { PreviewBadge } from "./preview-badge";
import "@houston/app/styles/globals.css";

initSentry();

initFrontendLogging();

installGlobalErrorHandlers();

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
    return <WorkspaceLoading />;
  }
  return <>{children}</>;
}

function useEngineTheme(): void {
  useEffect(() => {
    let cancelled = false;
    void whenEngineReady().then(() => {
      if (!cancelled) void loadThemePreference();
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

function SignedInLocaleSync() {
  const session = useSession();
  const uid = session.data?.uid;
  if (!uid) return null;
  return <LocaleSyncOnce key={uid} />;
}

function LocaleSyncOnce() {
  useLocalePreference();
  return null;
}

export default function AppTree() {
  useEngineTheme();
  useUsageAccrual();
  const cloudWeb = isIdentityConfigured();
  const app = <IdentityKeyedApp />;

  return (
    <QueryClientProvider client={queryClient}>
      <ProductAnalyticsSinkMount />
      <WebSessionStartMount />
      <ErrorBoundary>
        <TooltipProvider>
          <EngineGate>
            <QueryPersistenceProvider>
              <I18nextProvider i18n={i18n}>
                <PreviewBadge />
                {cloudWeb ? (
                  <>
                    <SignedInLocaleSync />
                    {app}
                  </>
                ) : (
                  <LanguageGate>{app}</LanguageGate>
                )}
              </I18nextProvider>
            </QueryPersistenceProvider>
          </EngineGate>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
