import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { AsyncButton } from "@houston-ai/core";
import { tauriProvider, type ProviderStatus } from "../../../lib/tauri";
import { PROVIDERS } from "../../../lib/providers";
import { useClaudeInstall } from "../../../hooks/use-claude-install";
import { ClaudeInstallHint } from "../../shell/claude-install-hint";
import { ProviderGlyph } from "../../shell/provider-logos";
import { SetupCard } from "../setup-card";

interface ProviderLoginMissionProps {
  eyebrow: string;
  /** The provider id picked on the previous screen. */
  providerId: string;
  onBack: () => void;
  /** Create the workspace + assistant and advance. Owns the error toast. */
  onContinue: () => Promise<void> | void;
}

/**
 * Step 2 of the AI setup: CONNECT the provider the user picked. If Houston
 * already detects the provider's CLI signed in on this machine (the user's own
 * subscription), this is a success screen with nothing to do. Otherwise it's a
 * single clear "Log in to {Provider}" button that launches the browser flow and
 * flips to connected once they finish.
 */
export function ProviderLoginMission({
  eyebrow,
  providerId,
  onBack,
  onContinue,
}: ProviderLoginMissionProps) {
  const { t } = useTranslation(["setup", "providers"]);
  const provider = PROVIDERS.find((p) => p.id === providerId);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loginLaunched, setLoginLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!provider) return;
    setStatus(await tauriProvider.checkStatus(provider.id));
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installed = status?.cli_installed ?? false;
  const connected = installed && (status?.authenticated ?? false);

  // Houston-managed `claude` install (license forbids bundling) — show the real
  // download reason + Retry instead of a Log-in button that would only error.
  const claudeInstall = useClaudeInstall({ onReady: () => void refresh() });

  // Poll until connected so the screen flips the moment the browser sign-in
  // finishes.
  useEffect(() => {
    if (connected) return;
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, [connected, refresh]);

  const name = provider?.name ?? providerId;

  const handleLogin = useCallback(async () => {
    if (!provider) return;
    setError(null);
    try {
      await tauriProvider.launchLogin(provider.id);
      setLoginLaunched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [provider]);

  const handleCancel = useCallback(async () => {
    if (!provider) return;
    setError(null);
    try {
      await tauriProvider.cancelLogin(provider.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginLaunched(false);
    }
  }, [provider]);

  const handleContinue = useCallback(async () => {
    if (!connected) return;
    setSubmitting(true);
    try {
      await onContinue();
    } finally {
      setSubmitting(false);
    }
  }, [connected, onContinue]);

  const showInstallHint =
    !installed && provider?.id === "anthropic" && claudeInstall != null;

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.providerLogin.title", { provider: name })}
      subtitle={
        connected
          ? undefined
          : t("setup:tutorial.missions.providerLogin.body", { provider: name })
      }
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={() => void handleContinue()}
      nextLabel={
        submitting
          ? t("setup:tutorial.missions.providerLogin.creating")
          : t("setup:tutorial.nav.continue")
      }
      nextDisabled={!connected}
      nextLoading={submitting}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
          <ProviderGlyph providerId={providerId} />
        </span>

        {connected ? (
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Check className="size-4" />
              {t("setup:tutorial.missions.providerLogin.connected.title")}
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("setup:tutorial.missions.providerLogin.connected.body", {
                provider: name,
              })}
            </p>
          </div>
        ) : showInstallHint && claudeInstall ? (
          <div className="w-full max-w-sm">
            <ClaudeInstallHint state={claudeInstall} />
          </div>
        ) : loginLaunched ? (
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("setup:tutorial.missions.providerLogin.waiting", { provider: name })}
            </span>
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("setup:tutorial.missions.providerLogin.cancel")}
            </button>
          </div>
        ) : (
          <AsyncButton className="h-11 rounded-full px-5" onClick={handleLogin}>
            <ExternalLink className="size-4" />
            {t("setup:tutorial.missions.providerLogin.loginButton", {
              provider: name,
            })}
          </AsyncButton>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </SetupCard>
  );
}
