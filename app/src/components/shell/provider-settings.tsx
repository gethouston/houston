import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Spinner, ConfirmDialog } from "@houston-ai/core";
import { tauriProvider, type ProviderStatus } from "../../lib/tauri";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { analytics } from "../../lib/analytics";
import { GeminiConnectDialog } from "./gemini-connect-dialog";
import { ProviderAccountRow } from "./provider-account-row";

/**
 * Settings-screen variant of the AI provider UI: accounts only.
 *
 * Houston used to also expose a workspace-level "default provider" picker
 * here, but the workspace layer was retired in favor of per-agent storage.
 * The agent-creation dialog reads its picker default from
 * `tauriProvider.getLastUsed()`, and the chat-tab picker persists straight
 * to the agent's config — so this screen has only one job left: sign in or
 * sign out of the providers Houston knows about.
 *
 * Setup/onboarding still uses `<ProviderPicker>` — there the user has zero
 * connections and the goal is exactly one decision (pick + connect).
 */
export function ProviderSettings() {
  const { t } = useTranslation("providers");
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmSignOutFor, setConfirmSignOutFor] = useState<ProviderInfo | null>(null);
  const [apiKeyDialogFor, setApiKeyDialogFor] = useState<ProviderInfo | null>(null);
  const addToast = useUIStore((s) => s.addToast);

  // First scan is treated as the baseline so opening Settings while a
  // provider is already connected doesn't fire a fake "X connected" toast.
  // Subsequent scans react to transitions normally.
  const hasBaseline = useRef(false);
  const prevStatuses = useRef<Record<string, ProviderStatus>>({});
  const loadStatuses = useCallback(async () => {
    const results = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const),
    );
    const next: Record<string, ProviderStatus> = {};
    for (const [id, status] of results) {
      next[id] = status;
    }
    if (hasBaseline.current) {
      for (const prov of PROVIDERS) {
        const wasConnected =
          prevStatuses.current[prov.id]?.cli_installed &&
          prevStatuses.current[prov.id]?.authenticated;
        const isConnected = next[prov.id]?.cli_installed && next[prov.id]?.authenticated;
        if (!wasConnected && isConnected) {
          analytics.track("provider_configured", { provider: prov.id });
        }
      }
    }
    prevStatuses.current = next;
    hasBaseline.current = true;
    setStatuses(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pendingId) {
      pollRef.current = setInterval(loadStatuses, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pendingId, loadStatuses]);

  useEffect(() => {
    if (!pendingId) return;
    const status = statuses[pendingId];
    if (status?.cli_installed && status?.authenticated) {
      setPendingId(null);
    }
  }, [pendingId, statuses]);

  const handleConnect = async (provider: ProviderInfo) => {
    if (provider.loginKind === "apiKey") {
      setApiKeyDialogFor(provider);
      return;
    }
    setPendingId(provider.id);
    try {
      await tauriProvider.launchLogin(provider.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provider-settings] launchLogin(${provider.id}) failed:`, msg);
      addToast({
        title: t("toast.signInFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
      setPendingId(null);
    }
  };

  const handleSignOut = async (provider: ProviderInfo) => {
    setPendingId(provider.id);
    try {
      await tauriProvider.launchLogout(provider.id);
      await loadStatuses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provider-settings] launchLogout(${provider.id}) failed:`, msg);
      addToast({
        title: t("toast.signOutFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
    } finally {
      setPendingId(null);
    }
  };

  // Connected providers float to the top so the user lands on what's
  // already working. Within each group we preserve `PROVIDERS` order — the
  // catalog is the source of truth for "which brand should be more prominent
  // when nothing is connected yet," and we don't want connect/disconnect to
  // shuffle siblings around each other.
  const orderedProviders = useMemo(() => {
    const connected: ProviderInfo[] = [];
    const disconnected: ProviderInfo[] = [];
    for (const p of PROVIDERS) {
      const s = statuses[p.id];
      if (s?.cli_installed && s?.authenticated) connected.push(p);
      else disconnected.push(p);
    }
    return [...connected, ...disconnected];
  }, [statuses]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2">
        {orderedProviders.map((prov) => {
          const status = statuses[prov.id];
          const connected = (status?.cli_installed && status?.authenticated) ?? false;
          return (
            <ProviderAccountRow
              key={prov.id}
              provider={prov}
              connected={connected}
              pending={pendingId === prov.id}
              onConnect={() => handleConnect(prov)}
              onSignOut={() => setConfirmSignOutFor(prov)}
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmSignOutFor !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmSignOutFor(null);
        }}
        title={t("signOutConfirm.title", { provider: confirmSignOutFor?.name ?? "" })}
        description={t("signOutConfirm.description", { provider: confirmSignOutFor?.name ?? "" })}
        confirmLabel={t("signOutConfirm.confirm")}
        cancelLabel={t("signOutConfirm.cancel")}
        variant="destructive"
        onConfirm={() => {
          const target = confirmSignOutFor;
          setConfirmSignOutFor(null);
          if (target) handleSignOut(target);
        }}
      />

      <GeminiConnectDialog
        provider={apiKeyDialogFor}
        onOpenChange={(open) => {
          if (!open) setApiKeyDialogFor(null);
        }}
        onSaved={(providerId) => {
          setPendingId(providerId);
          loadStatuses();
        }}
        onLoginStarted={(providerId) => {
          setPendingId(providerId);
        }}
      />
    </>
  );
}
