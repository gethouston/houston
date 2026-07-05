import { AsyncButton } from "@houston-ai/core";
import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../../lib/analytics";
import { PROVIDERS } from "../../../lib/providers";
import { type ProviderStatus, tauriProvider } from "../../../lib/tauri";
import { ProviderLoginDialog } from "../../shell/provider-login-dialog";
import { ProviderGlyph } from "../../shell/provider-logos";
import { SetupCard } from "../setup-card";
import { SuccessCheck } from "../success-check";
import { useProviderLoginEvents } from "./use-provider-login-events";

interface ProviderLoginMissionProps {
  eyebrow: string;
  /** The provider id picked on the previous screen. */
  providerId: string;
  onBack: () => void;
  /** Advance to the next setup step once the provider is connected. */
  onContinue: () => void;
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

  const refresh = useCallback(async () => {
    if (!provider) return;
    setStatus(await tauriProvider.checkStatus(provider.id));
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installed = status?.cli_installed ?? false;
  const connected = installed && (status?.authenticated ?? false);

  // v3 wire: the runtime can't open the user's browser — the adapter surfaces
  // the OAuth URL as a `ProviderLoginUrl` event and the ACTIVE view must act on
  // it. The shell's picker/settings handle it there; during onboarding neither
  // is mounted, so this mission handles its own (desktop opens the browser /
  // codex loopback; device-code or web/remote clients get the dialog below).
  // On the legacy Rust wire the CLI opens the browser itself and no local URL
  // event fires, so this is inert there.
  const { dialog, closeDialog } = useProviderLoginEvents({
    providerId,
    onOpenFailed: (message) => {
      setError(message);
      setLoginLaunched(false);
    },
    onFailed: (loginError) => {
      // Benign cancel arrives with a null error: clear the spinner quietly.
      setError(loginError);
      setLoginLaunched(false);
    },
  });

  // The AI provider became connected. Fire the funnel event once, then advance
  // straight to the success screen — the user shouldn't sit on an inline
  // "connected" state. (Also fires on mount when the CLI is already signed in.)
  const providerConnectedFired = useRef(false);
  useEffect(() => {
    if (connected && !providerConnectedFired.current) {
      providerConnectedFired.current = true;
      analytics.track("ai_provider_connected", { provider: providerId });
      onContinue();
    }
  }, [connected, providerId, onContinue]);

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

  const handleContinue = useCallback(() => {
    if (!connected) return;
    onContinue();
  }, [connected, onContinue]);

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.providerLogin.title", {
        provider: name,
      })}
      subtitle={
        connected
          ? undefined
          : t("setup:tutorial.missions.providerLogin.body", { provider: name })
      }
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={handleContinue}
      nextLabel={t("setup:tutorial.nav.continue")}
      nextDisabled={!connected}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {!connected && (
          <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
            <ProviderGlyph providerId={providerId} />
          </span>
        )}

        {connected ? (
          <div className="flex flex-col items-center gap-3">
            <SuccessCheck />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-foreground">
                {t("setup:tutorial.missions.providerLogin.connected.title")}
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("setup:tutorial.missions.providerLogin.connected.body", {
                  provider: name,
                })}
              </p>
            </div>
          </div>
        ) : loginLaunched ? (
          <div className="flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("setup:tutorial.missions.providerLogin.waiting", {
                provider: name,
              })}
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

        {/* Remote / device-code fallback: the same sign-in dialog the shell
            uses (one-time code, copy/open URL, paste-back). Desktop's direct
            browser open and the codex loopback never reach this. */}
        <ProviderLoginDialog
          provider={dialog ? (provider ?? null) : null}
          url={dialog?.url ?? null}
          userCode={dialog?.userCode}
          onClose={closeDialog}
        />
      </div>
    </SetupCard>
  );
}
