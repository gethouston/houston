import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner } from "@houston-ai/core";
import { useUIStore } from "../../stores/ui";
import { tauriProvider } from "../../lib/tauri";
import { getProvider } from "../../lib/providers";
import {
  isApiKeyOnlyProvider,
  isDualPathConnectProvider,
} from "../../lib/provider-api-key";
import {
  providerIsAuthenticated,
  providerReconnectSignalState,
  resolveReconnectProviderId,
  shouldClearStaleAuthRequired,
} from "./provider-reconnect-state";
import { ApiKeyAdvancedSection } from "./api-key-advanced-section";
import { ApiKeyForm } from "./api-key-form";
import { ProviderBrandLogo } from "./provider-logos";

interface ProviderReconnectCardProps {
  providerId?: string;
  signalKey?: string;
}

export function ProviderReconnectCard({
  providerId,
  signalKey,
}: ProviderReconnectCardProps) {
  const { t } = useTranslation(["shell", "common"]);
  const authRequired = useUIStore((s) => s.authRequired);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const [loginLaunched, setLoginLaunched] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [apiKeyExpanded, setApiKeyExpanded] = useState(false);
  const [resolvedSignal, setResolvedSignal] = useState<string | null>(null);
  const [signalNeedsAuth, setSignalNeedsAuth] = useState(false);

  useEffect(() => {
    if (shouldClearStaleAuthRequired(authRequired, providerId)) {
      setAuthRequired(null);
    }
  }, [authRequired, providerId, setAuthRequired]);

  useEffect(() => {
    setResolvedSignal(null);
    setSignalNeedsAuth(false);
  }, [providerId]);

  const matchedAuthRequired =
    authRequired && providerId && authRequired === providerId ? authRequired : null;
  const shouldCheckSignal =
    !matchedAuthRequired && !!providerId && !!signalKey && signalKey !== resolvedSignal;
  const activeProviderId = resolveReconnectProviderId({
    authRequired,
    activeProviderId: providerId,
    signalNeedsAuth,
  });
  const provider = activeProviderId ? getProvider(activeProviderId) : null;
  const apiKeyOnly = isApiKeyOnlyProvider(provider);
  const dualPath = isDualPathConnectProvider(provider);

  useEffect(() => {
    setLoginLaunched(false);
    setLoginError(false);
    setApiKeyExpanded(false);
  }, [activeProviderId, authRequired, providerId, signalKey]);

  useEffect(() => {
    setSignalNeedsAuth(false);
    if (!shouldCheckSignal || !providerId || !signalKey) return;
    let cancelled = false;
    tauriProvider.checkStatus(providerId)
      .then((status) => {
        if (cancelled) return;
        if (providerReconnectSignalState(status) === "needs_auth") {
          setSignalNeedsAuth(true);
        } else {
          setResolvedSignal(signalKey);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId, shouldCheckSignal, signalKey]);

  useEffect(() => {
    if (!activeProviderId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const status = await tauriProvider.checkStatus(activeProviderId);
        if (cancelled) return;
        if (providerIsAuthenticated(status)) {
          setAuthRequired(null);
          if (signalKey) setResolvedSignal(signalKey);
          setLoginLaunched(false);
        }
      } catch {
        // Keep the reconnect card visible; the next poll may succeed.
      }
    };
    void check();
    const interval = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeProviderId, signalKey, setAuthRequired]);

  const handleSaved = useCallback(async () => {
    if (!activeProviderId) return;
    try {
      const status = await tauriProvider.checkStatus(activeProviderId);
      if (providerIsAuthenticated(status)) {
        setAuthRequired(null);
        if (signalKey) setResolvedSignal(signalKey);
      }
    } catch {}
  }, [activeProviderId, signalKey, setAuthRequired]);

  const handleSignIn = useCallback(async () => {
    if (!activeProviderId) return;
    try {
      await tauriProvider.launchLogin(activeProviderId);
      setLoginError(false);
      setLoginLaunched(true);
    } catch {
      setLoginLaunched(false);
      setLoginError(true);
    }
  }, [activeProviderId]);

  if (!activeProviderId || !provider) return null;

  return (
    <div className="w-full min-w-0 overflow-hidden px-1 py-2">
      <div className="flex min-w-0 items-start gap-4 overflow-hidden rounded-2xl bg-secondary p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <ProviderBrandLogo providerId={activeProviderId} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <p className="break-words text-sm font-semibold text-foreground">
            {t("shell:providerReconnect.title")}
          </p>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">
            {t("shell:providerReconnect.body", { provider: provider.subtitle })}
          </p>

          <div className="mt-2 min-w-0 space-y-3">
            {apiKeyOnly ? (
              <div className="min-w-0 w-full basis-full">
                <ApiKeyForm
                  providerName={provider.name}
                  providerId={provider.id}
                  apiKeyConsoleUrl={provider.apiKeyConsoleUrl ?? ""}
                  credentialTarget="activeAgent"
                  onSaved={handleSaved}
                />
              </div>
            ) : (
              <>
                {!loginLaunched ? (
                  <Button
                    onClick={handleSignIn}
                    className="h-8 max-w-full gap-2 rounded-full px-3 text-xs"
                    size="sm"
                  >
                    <ProviderBrandLogo providerId={activeProviderId} className="h-4 w-4" />
                    <span className="truncate">
                      {t("shell:authReconnect.signInWith", { provider: provider.name })}
                    </span>
                  </Button>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Spinner className="h-3.5 w-3.5 shrink-0" />
                      <span className="break-words">{t("shell:providerReconnect.waiting")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t("common:actions.tryAgain")}
                    </button>
                  </div>
                )}
                {loginError && (
                  <p className="break-words text-xs text-destructive">
                    {t("shell:providerReconnect.launchError")}
                  </p>
                )}
                {dualPath && provider.apiKeyConsoleUrl ? (
                  <ApiKeyAdvancedSection
                    provider={provider}
                    expanded={apiKeyExpanded}
                    onExpandedChange={setApiKeyExpanded}
                    credentialTarget="activeAgent"
                    onSaved={handleSaved}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
