import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProvider } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { RowCard } from "../cards/row-card";
import { RowCardButton } from "../cards/row-card-button";
import { ProviderGlyph } from "./provider-logos";
import {
  providerIsAuthenticated,
  providerReconnectSignalState,
  reconnectProviderForChat,
} from "./provider-reconnect-state";

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
  const [resolvedSignal, setResolvedSignal] = useState<string | null>(null);
  const [signalNeedsAuth, setSignalNeedsAuth] = useState(false);

  // `authRequired` is a single global flag (set by whichever session last hit
  // an auth error). Only let it drive THIS card when it names this chat's
  // provider; otherwise fall back to this chat's own feed signal. This is what
  // keeps a Claude logout from leaking a "Connect Claude" button into an
  // OpenAI chat (HOU-410).
  const authMatchesChat = !!authRequired && authRequired === providerId;
  const shouldCheckSignal =
    !authMatchesChat &&
    !!providerId &&
    !!signalKey &&
    signalKey !== resolvedSignal;
  const activeProviderId = reconnectProviderForChat({
    authRequired,
    chatProvider: providerId ?? null,
    signalNeedsAuth,
  });
  const provider = activeProviderId ? getProvider(activeProviderId) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeProviderId is a render-derived variable; the effect only calls stable setState setters but must re-run whenever the resolved provider changes — an empty dep array would run only once, which is wrong
  useEffect(() => {
    setLoginLaunched(false);
    setLoginError(false);
  }, [activeProviderId]);

  useEffect(() => {
    setSignalNeedsAuth(false);
    if (!shouldCheckSignal || !providerId || !signalKey) return;
    let cancelled = false;
    tauriProvider
      .checkStatus(providerId)
      .then((status) => {
        if (cancelled) return;
        if (providerReconnectSignalState(status) === "needs_auth") {
          setSignalNeedsAuth(true);
        } else {
          setResolvedSignal(signalKey);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedSignal(signalKey);
      });
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
          // Only clear the global flag if it belongs to the provider we just
          // confirmed — otherwise an OpenAI chat re-auth would wipe a pending
          // Claude reconnect (or vice-versa).
          if (authRequired === activeProviderId) setAuthRequired(null);
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
  }, [activeProviderId, authRequired, signalKey, setAuthRequired]);

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

  const description = loginError
    ? t("shell:providerReconnect.launchError")
    : loginLaunched
      ? t("shell:providerReconnect.waiting")
      : t("shell:providerReconnect.body", { provider: provider.name });

  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<ProviderGlyph providerId={activeProviderId} />}
        title={t("shell:providerReconnect.title")}
        description={description}
        action={
          <RowCardButton
            label={
              loginLaunched
                ? t("common:actions.tryAgain")
                : t("shell:authReconnect.signInWith")
            }
            onClick={handleSignIn}
            variant={loginLaunched ? "outline" : "default"}
          />
        }
      />
    </div>
  );
}
