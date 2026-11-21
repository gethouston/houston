import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reconnectCardShouldClear } from "../../lib/provider-connection";
import { getProvider } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { RowCard } from "../cards/row-card";
import { RowCardButton } from "../cards/row-card-button";
import { LocalModelDialog } from "./local-model-dialog";
import { ProviderGlyph } from "./provider-logos";
import { resolveReconnectCardPresentation } from "./provider-reconnect-presentation";
import {
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
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [resolvedSignal, setResolvedSignal] = useState<string | null>(null);
  const [signalNeedsAuth, setSignalNeedsAuth] = useState(false);

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
      const probe = await tauriProvider
        .checkStatus(activeProviderId)
        .then((status) => ({ ok: true, status }) as const)
        .catch(() => ({ ok: false }) as const);
      if (cancelled) return;
      if (reconnectCardShouldClear(probe)) {
        if (authRequired === activeProviderId) setAuthRequired(null);
        if (signalKey) setResolvedSignal(signalKey);
        setLoginLaunched(false);
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
    if (activeProviderId === "openai-compatible") {
      setShowCustomDialog(true);
      return;
    }
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

  const pres = resolveReconnectCardPresentation({ loginLaunched, loginError });

  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<ProviderGlyph providerId={activeProviderId} />}
        title={t("shell:providerReconnect.title")}
        description={t(pres.descriptionKey, { provider: provider.name })}
        action={
          <RowCardButton
            label={t(pres.buttonLabelKey, { provider: provider.name })}
            onClick={handleSignIn}
            variant={pres.buttonVariant}
          />
        }
      />

      <LocalModelDialog
        provider={showCustomDialog ? provider : null}
        onClose={() => setShowCustomDialog(false)}
      />
    </div>
  );
}
