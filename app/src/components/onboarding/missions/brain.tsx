import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, RefreshCw, Terminal } from "lucide-react";
import { AsyncButton } from "@houston-ai/core";
import { tauriProvider, tauriSystem, type ProviderStatus } from "../../../lib/tauri";
import {
  PROVIDERS,
  COMING_SOON_PROVIDERS,
  type ProviderInfo,
  type ComingSoonProviderInfo,
} from "../../../lib/providers";
import { useClaudeInstall, type ClaudeInstallState } from "../../../hooks/use-claude-install";
import { ClaudeInstallHint } from "../../shell/claude-install-hint";
import { SetupCard, OptionGrid, OptionCard } from "../setup-card";

interface BrainMissionProps {
  eyebrow: string;
  provider: string | null;
  onBack: () => void;
  onSelect: (provider: string, model: string) => void;
  onContinue: () => Promise<void> | void;
}

export function BrainMission({
  eyebrow,
  provider,
  onBack,
  onSelect,
  onContinue,
}: BrainMissionProps) {
  const { t } = useTranslation(["setup", "providers", "common"]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const),
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Anthropic uses a Houston-managed runtime install for `claude` (the
  // license forbids bundling). Track the install state separately so the
  // SetupHint can render a real reason + Retry instead of the generic
  // "install it yourself" message — issue #231.
  const claudeInstall = useClaudeInstall({
    onReady: () => void refresh(),
  });

  // Poll while a disconnected provider is selected so the screen unblocks the
  // moment the user finishes the browser sign-in flow.
  useEffect(() => {
    if (!provider) return;
    const status = statuses[provider];
    const connected = !!status?.cli_installed && !!status?.authenticated;
    if (connected) return;
    const id = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(id);
  }, [provider, refresh, statuses]);

  const selectedConnected =
    !!provider && !!statuses[provider]?.cli_installed && !!statuses[provider]?.authenticated;

  const handleContinue = async () => {
    if (!selectedConnected) return;
    setSubmitting(true);
    try {
      await onContinue();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.brain.title")}
      subtitle={t("setup:tutorial.missions.brain.body")}
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={() => void handleContinue()}
      nextLabel={
        submitting
          ? t("setup:tutorial.missions.brain.creating")
          : t("setup:tutorial.missions.brain.continue")
      }
      nextDisabled={!selectedConnected}
      nextLoading={submitting}
      helper={
        selectedConnected
          ? t("setup:tutorial.missions.brain.continueHint")
          : undefined
      }
    >
      <OptionGrid>
        {PROVIDERS.map((prov, i) => (
          <ProviderCard
            key={prov.id}
            number={i + 1}
            provider={prov}
            status={statuses[prov.id]}
            selected={provider === prov.id}
            onSelect={(modelId) => onSelect(prov.id, modelId)}
            onRefresh={refresh}
            costLabel={prov.cost}
            claudeInstall={prov.id === "anthropic" ? claudeInstall : null}
          />
        ))}
        {COMING_SOON_PROVIDERS.map((prov, i) => (
          <ComingSoonCard
            key={prov.id}
            number={PROVIDERS.length + i + 1}
            provider={prov}
          />
        ))}
      </OptionGrid>
    </SetupCard>
  );
}

function ProviderCard({
  number,
  provider,
  status,
  selected,
  onSelect,
  onRefresh,
  costLabel,
  claudeInstall,
}: {
  number: number;
  provider: ProviderInfo;
  status: ProviderStatus | undefined;
  selected: boolean;
  onSelect: (modelId: string) => void;
  onRefresh: () => Promise<void>;
  costLabel: string;
  /** Live install state for Houston-managed CLIs. Pass `null` for any
   *  provider that ships a bundled CLI — the generic install hint fires for
   *  those. */
  claudeInstall: ClaudeInstallState | null;
}) {
  const { t } = useTranslation(["setup", "providers"]);
  const installed = status?.cli_installed ?? false;
  const authenticated = status?.authenticated ?? false;
  const connected = installed && authenticated;
  const [loginLaunched, setLoginLaunched] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handlePick = () => onSelect(provider.defaultModel);

  const handleSignIn = async () => {
    setLoginError(null);
    handlePick();
    try {
      await tauriProvider.launchLogin(provider.id);
      setLoginLaunched(true);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    }
  };

  // "Cancel and try again": tear down the engine-side login subprocess, THEN
  // re-arm the local UI. Resetting `loginLaunched` alone left the CLI running,
  // so re-clicking Sign in was rejected as "already pending" and the user had
  // to restart Houston (#237). cancelLogin frees the slot so the retry works.
  const handleCancelWaiting = async () => {
    setLoginError(null);
    try {
      await tauriProvider.cancelLogin(provider.id);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginLaunched(false);
    }
  };

  return (
    <OptionCard
      number={number}
      label={provider.name}
      description={connected ? t("providers:card.connected") : provider.subtitle}
      selected={selected}
      onSelect={handlePick}
    >
      <p className="ml-7 text-xs text-muted-foreground">{costLabel}</p>
      {selected && !connected && (
        <div className="ml-7">
          <SetupHint
            provider={provider}
            installed={installed}
            loginLaunched={loginLaunched}
            loginError={loginError}
            onSignIn={handleSignIn}
            onRefresh={() => void onRefresh()}
            onCancelWaiting={() => void handleCancelWaiting()}
            claudeInstall={claudeInstall}
          />
        </div>
      )}
    </OptionCard>
  );
}

function ComingSoonCard({
  number,
  provider,
}: {
  number: number;
  provider: ComingSoonProviderInfo;
}) {
  const { t } = useTranslation("providers");
  return (
    <OptionCard
      number={number}
      label={provider.name}
      description={provider.subtitle}
      selected={false}
      disabled
      trailing={
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("card.comingSoon")}
        </span>
      }
    />
  );
}

function SetupHint({
  provider,
  installed,
  loginLaunched,
  loginError,
  onSignIn,
  onRefresh,
  onCancelWaiting,
  claudeInstall,
}: {
  provider: ProviderInfo;
  installed: boolean;
  loginLaunched: boolean;
  loginError: string | null;
  onSignIn: () => void | Promise<void>;
  onRefresh: () => void;
  onCancelWaiting: () => void;
  /** Houston-managed install state for the Anthropic CLI. `null` for
   *  bundled-CLI providers — they fall through to the generic install hint. */
  claudeInstall: ClaudeInstallState | null;
}) {
  const { t } = useTranslation(["setup", "providers"]);
  return (
    <div
      className="mt-2 rounded-lg bg-secondary/60 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      {!installed && claudeInstall && <ClaudeInstallHint state={claudeInstall} />}
      {!installed && !claudeInstall && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Terminal className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t("providers:setup.installHint", { cli: provider.cliName })}{" "}
            <a
              href={provider.installUrl}
              onClick={(e) => {
                e.preventDefault();
                void tauriSystem.openUrl(provider.installUrl);
              }}
              className="text-foreground underline underline-offset-2"
            >
              {t("providers:setup.installGuide")}
              <ExternalLink className="ml-0.5 inline size-3" />
            </a>
          </span>
        </div>
      )}
      {installed && !loginLaunched && (
        <AsyncButton size="sm" className="rounded-full" onClick={onSignIn}>
          <ExternalLink className="size-3.5" />
          {t("providers:setup.signInWith", { provider: provider.name })}
        </AsyncButton>
      )}
      {installed && loginLaunched && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{t("providers:setup.waiting")}</span>
          </div>
          <button
            type="button"
            onClick={onCancelWaiting}
            className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("providers:setup.cancelWaiting")}
          </button>
        </div>
      )}
      {!installed && !claudeInstall && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          {t("providers:setup.installedCheckAgain")}
        </button>
      )}
      {loginError && <p className="mt-2 text-xs text-destructive">{loginError}</p>}
    </div>
  );
}
