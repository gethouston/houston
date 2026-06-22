import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CircleDashed,
  ExternalLink,
  Loader2,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { AsyncButton, Button, cn } from "@houston-ai/core";
import {
  tauriProvider,
  tauriSystem,
  type ProviderStatus,
} from "../../../lib/tauri";
import {
  PROVIDERS,
  COMING_SOON_PROVIDERS,
  type ProviderInfo,
  type ComingSoonProviderInfo,
} from "../../../lib/providers";

/**
 * The first-run tutorial connects an OAuth subscription provider (Claude /
 * Codex). API-key providers (OpenCode Zen / Go) connect by pasting a key, which
 * doesn't fit this mission's inline install/sign-in hint — the user connects
 * them in Settings or the chat provider picker instead.
 */
const ONBOARDING_PROVIDERS = PROVIDERS.filter((p) => p.auth !== "apiKey");

interface BrainMissionProps {
  provider: string | null;
  onSelect: (provider: string, model: string) => void;
  onContinue: () => Promise<void> | void;
}

export function BrainMission({
  provider,
  onSelect,
  onContinue,
}: BrainMissionProps) {
  const { t } = useTranslation(["setup", "providers", "common"]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      ONBOARDING_PROVIDERS.map(async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const),
    );
    setStatuses(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    !!provider &&
    !!statuses[provider]?.cli_installed &&
    !!statuses[provider]?.authenticated;

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
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ONBOARDING_PROVIDERS.map((prov) => (
          <ProviderCard
            key={prov.id}
            provider={prov}
            status={statuses[prov.id]}
            loading={loading}
            selected={provider === prov.id}
            onSelect={(modelId) => onSelect(prov.id, modelId)}
            onRefresh={refresh}
            costLabel={prov.cost}
          />
        ))}
        {COMING_SOON_PROVIDERS.map((prov) => (
          <ComingSoonCard key={prov.id} provider={prov} />
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          className="rounded-full"
          disabled={!selectedConnected || submitting}
          onClick={() => void handleContinue()}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitting
            ? t("setup:tutorial.missions.brain.creating")
            : t("setup:tutorial.missions.brain.continue")}
        </Button>
      </div>
      {selectedConnected && !submitting && (
        <p className="text-xs text-muted-foreground">
          {t("setup:tutorial.missions.brain.continueHint")}
        </p>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  status,
  loading,
  selected,
  onSelect,
  onRefresh,
  costLabel,
}: {
  provider: ProviderInfo;
  status: ProviderStatus | undefined;
  loading: boolean;
  selected: boolean;
  onSelect: (modelId: string) => void;
  onRefresh: () => Promise<void>;
  costLabel: string;
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

  // "Cancel and try again": tear down the engine-side login subprocess,
  // THEN re-arm the local UI. Resetting `loginLaunched` alone (as this
  // used to do) left the CLI running, so re-clicking Sign in was
  // rejected as "already pending" and the user had to restart Houston
  // (#237). cancelLogin frees the slot so the retry actually works.
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
    <button
      type="button"
      onClick={handlePick}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-all",
        "border-black/5 hover:border-black/15 hover:shadow-[0_1px_0_rgba(0,0,0,0.05)]",
        selected && "border-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{provider.name}</p>
          <p className="text-xs text-muted-foreground">{provider.subtitle}</p>
        </div>
        <ProviderStatusPill loading={loading} connected={connected} />
      </div>
      <p className="text-xs text-muted-foreground">{costLabel}</p>
      {selected && !connected && (
        <SetupHint
          provider={provider}
          installed={installed}
          loginLaunched={loginLaunched}
          loginError={loginError}
          onSignIn={handleSignIn}
          onRefresh={() => void onRefresh()}
          onCancelWaiting={() => void handleCancelWaiting()}
        />
      )}
      {selected && connected && (
        <p className="text-xs text-[#00a240]">
          {t("providers:card.connected")}
        </p>
      )}
    </button>
  );
}

function ComingSoonCard({ provider }: { provider: ComingSoonProviderInfo }) {
  const { t } = useTranslation("providers");
  return (
    <div
      aria-disabled="true"
      className={cn(
        "flex w-full cursor-not-allowed flex-col gap-3 rounded-xl border bg-background/60 p-4 text-left",
        "border-black/5 opacity-60 select-none",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{provider.name}</p>
          <p className="text-xs text-muted-foreground">{provider.subtitle}</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("card.comingSoon")}
        </span>
      </div>
    </div>
  );
}

function ProviderStatusPill({
  loading,
  connected,
}: {
  loading: boolean;
  connected: boolean;
}) {
  const { t } = useTranslation("providers");
  if (loading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#00a240]">
        <Check className="size-3" />
        {t("card.connected")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleDashed className="size-3" />
      {t("card.notConnected")}
    </span>
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
}: {
  provider: ProviderInfo;
  installed: boolean;
  loginLaunched: boolean;
  loginError: string | null;
  onSignIn: () => void | Promise<void>;
  onRefresh: () => void;
  onCancelWaiting: () => void;
}) {
  const { t } = useTranslation(["setup", "providers"]);
  return (
    <div
      className="rounded-lg bg-secondary/60 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      {!installed && (
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
          {/* Escape hatch — if the user closed the browser or the sign-in
           * stalled, the only signal the UI had until now was a forever
           * spinner. Real users hit this and reported being "stuck."
           * `onCancelWaiting` flips loginLaunched back to false so the
           * Sign-in button reappears and they can re-launch the flow. */}
          <button
            type="button"
            onClick={onCancelWaiting}
            className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("providers:setup.cancelWaiting")}
          </button>
        </div>
      )}
      {!installed && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          {t("providers:setup.installedCheckAgain")}
        </button>
      )}
      {loginError && (
        <p className="mt-2 text-xs text-destructive">{loginError}</p>
      )}
    </div>
  );
}
