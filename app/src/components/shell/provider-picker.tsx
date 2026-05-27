import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonEvent } from "@houston-ai/core";
import { Spinner, ConfirmDialog } from "@houston-ai/core";
import { tauriProvider, type ProviderStatus } from "../../lib/tauri";
import {
  PROVIDERS,
  COMING_SOON_PROVIDERS,
  type ProviderInfo,
} from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { analytics } from "../../lib/analytics";
import { subscribeHoustonEvents } from "../../lib/events";
import { GeminiConnectDialog } from "./gemini-connect-dialog";
import { ProviderLoginDialog } from "./provider-login-dialog";
import { ProviderCard, ComingSoonCard } from "./provider-cards";

interface Props {
  /** Current workspace provider id (used to push the new default after sign-in). */
  value: string | null;
  model?: string | null;
  /** Fired with (providerId, defaultModel) after a successful sign-in. */
  onSelect: (provider: string, model: string) => void;
}

export function ProviderPicker({ onSelect }: Props) {
  const { t } = useTranslation("providers");
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmSignOutFor, setConfirmSignOutFor] = useState<ProviderInfo | null>(null);
  const [apiKeyDialogFor, setApiKeyDialogFor] = useState<ProviderInfo | null>(null);
  // OAuth URL surfaced by the engine when the CLI couldn't open the
  // user's browser (remote/headless deployments). Cleared on
  // ProviderLoginComplete or when the user closes the dialog.
  const [loginDialog, setLoginDialog] = useState<{
    provider: ProviderInfo;
    url: string;
  } | null>(null);
  const addToast = useUIStore((s) => s.addToast);

  const prevStatuses = useRef<Record<string, ProviderStatus>>({});
  const loadStatuses = useCallback(async () => {
    // Probe every active provider in parallel. New providers added to the
    // PROVIDERS list are picked up automatically; never hardcode ids here.
    const results = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const),
    );
    const next: Record<string, ProviderStatus> = {};
    for (const [id, status] of results) {
      next[id] = status;
    }
    for (const prov of PROVIDERS) {
      const wasConnected =
        prevStatuses.current[prov.id]?.cli_installed &&
        prevStatuses.current[prov.id]?.authenticated;
      const isConnected = next[prov.id]?.cli_installed && next[prov.id]?.authenticated;
      if (!wasConnected && isConnected) {
        analytics.track("provider_configured", { provider: prov.id });
        onSelect(prov.id, prov.defaultModel);
      }
    }
    prevStatuses.current = next;
    setStatuses(next);
    setLoading(false);
  }, [onSelect]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // Poll while a sign-in is in flight so the card flips as soon as the
  // browser handshake completes.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pendingId) {
      pollRef.current = setInterval(loadStatuses, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pendingId, loadStatuses]);

  // Stop polling when the pending provider becomes connected.
  useEffect(() => {
    if (!pendingId) return;
    const status = statuses[pendingId];
    if (status?.cli_installed && status?.authenticated) {
      setPendingId(null);
    }
  }, [pendingId, statuses]);

  // Sign-in lifecycle events. `ProviderLoginUrl` surfaces the OAuth URL
  // for remote/headless engines (the CLI can't open the local browser),
  // shown via <ProviderLoginDialog>. `ProviderLoginComplete` is the
  // authoritative end of an attempt: the status poll only ever flips a
  // card to Connected on SUCCESS, so without reacting to a failed or
  // cancelled completion the card would spin forever (the #237 bug this
  // picker had before — settings already handled it). Functional
  // setState avoids stale-closure reads when several providers fire
  // events concurrently.
  useEffect(() => {
    const off = subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        const prov = PROVIDERS.find((p) => p.id === ev.data.provider);
        if (prov) {
          setLoginDialog({ provider: prov, url: ev.data.url });
        }
      } else if (ev.type === "ProviderLoginComplete") {
        const prov = PROVIDERS.find((p) => p.id === ev.data.provider);
        if (ev.data.success) {
          addToast({
            title: t("toast.signInSucceeded", { provider: prov?.name ?? ev.data.provider }),
            variant: "success",
          });
        } else if (ev.data.error) {
          // A user cancel completes with `success: false` and no
          // `error` — benign, so we stay quiet and just clear state.
          addToast({
            title: t("toast.signInFailed", { provider: prov?.name ?? ev.data.provider }),
            description: ev.data.error,
            variant: "error",
          });
        }
        setLoginDialog((current) =>
          current?.provider.id === ev.data.provider ? null : current,
        );
        setPendingId((current) => (current === ev.data.provider ? null : current));
        loadStatuses();
      }
    });
    return off;
  }, [addToast, loadStatuses, t]);

  const handleConnect = async (provider: ProviderInfo) => {
    // API-key providers (e.g. Gemini) have no CLI login flow. The engine
    // would return a BadRequest if we called `launchLogin`; instead we open
    // a dedicated dialog that walks the user through pasting an API key.
    if (provider.loginKind === "apiKey") {
      setApiKeyDialogFor(provider);
      return;
    }
    setPendingId(provider.id);
    try {
      await tauriProvider.launchLogin(provider.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provider-picker] launchLogin(${provider.id}) failed:`, msg);
      addToast({
        title: t("toast.signInFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
      setPendingId(null);
    }
  };

  const handleCancel = async (provider: ProviderInfo) => {
    // Tear down the engine-side login subprocess so the next Connect
    // isn't rejected as "already pending". Clear the local spinner
    // optimistically — the engine's benign ProviderLoginComplete is the
    // backstop, but the user clicked Cancel and should see it react now.
    try {
      await tauriProvider.cancelLogin(provider.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provider-picker] cancelLogin(${provider.id}) failed:`, msg);
      addToast({
        title: t("toast.cancelFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
    } finally {
      setPendingId((current) => (current === provider.id ? null : current));
      setLoginDialog((current) => (current?.provider.id === provider.id ? null : current));
    }
  };

  const handleSignOut = async (provider: ProviderInfo) => {
    setPendingId(provider.id);
    try {
      await tauriProvider.launchLogout(provider.id);
      await loadStatuses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provider-picker] launchLogout(${provider.id}) failed:`, msg);
      addToast({
        title: t("toast.signOutFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
    } finally {
      setPendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PROVIDERS.map((prov) => {
          const status = statuses[prov.id];
          const connected = (status?.cli_installed && status?.authenticated) ?? false;
          return (
            <ProviderCard
              key={prov.id}
              provider={prov}
              connected={connected}
              pending={pendingId === prov.id}
              onClick={() =>
                connected ? setConfirmSignOutFor(prov) : handleConnect(prov)
              }
              onCancel={() => handleCancel(prov)}
            />
          );
        })}
        {COMING_SOON_PROVIDERS.map((prov) => (
          <ComingSoonCard key={prov.id} provider={prov} />
        ))}
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
          // Flipping pendingId arms the 2s status poll defined in this
          // component, so the card transitions to "Connected" without a
          // Houston restart. The poll is also responsible for clearing
          // pendingId once the auth state reads `authenticated`.
          setPendingId(providerId);
          loadStatuses();
        }}
        onLoginStarted={(providerId) => {
          // OAuth path: gemini-cli is now driving the browser flow.
          // Arm the picker's status poll so the card flips to
          // Connected the moment gemini-cli writes its credential
          // files, same as the API-key save path above.
          setPendingId(providerId);
        }}
      />

      <ProviderLoginDialog
        provider={loginDialog?.provider ?? null}
        url={loginDialog?.url ?? null}
        onClose={() => setLoginDialog(null)}
      />
    </>
  );
}

