import type { HoustonEvent } from "@houston-ai/core";
import { ConfirmDialog, Spinner } from "@houston-ai/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { newEngineActive } from "../../lib/engine";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import {
  COMING_SOON_PROVIDERS,
  getVisibleProviders,
  PROVIDERS,
  type ProviderInfo,
} from "../../lib/providers";
import {
  type ProviderStatus,
  tauriProvider,
  tauriSystem,
} from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { ProviderApiKeyDialog } from "./provider-api-key-dialog";
import { ComingSoonCard, ProviderCard } from "./provider-cards";
import { ProviderEnterpriseDialog } from "./provider-enterprise-dialog";
import { ProviderLoginDialog } from "./provider-login-dialog";
import { shouldOpenLoginUrlDirectly } from "./provider-login-url";

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
  const [confirmSignOutFor, setConfirmSignOutFor] =
    useState<ProviderInfo | null>(null);
  // OAuth URL surfaced by the engine when the CLI couldn't open the
  // user's browser (remote/headless deployments). `userCode` is set for
  // codex's device-grant flow (the one-time code to enter on OpenAI's
  // page); null for Claude's paste-back flow. Cleared on
  // ProviderLoginComplete or when the user closes the dialog.
  const [loginDialog, setLoginDialog] = useState<{
    provider: ProviderInfo;
    url: string;
    userCode: string | null;
  } | null>(null);
  // The paste-a-key dialog for API-key providers (OpenCode Zen / Go).
  const [apiKeyDialog, setApiKeyDialog] = useState<ProviderInfo | null>(null);
  // The GitHub Copilot Enterprise card collects the company GitHub domain here
  // before starting login (the device-code flow is domain-specific).
  const [enterpriseDialog, setEnterpriseDialog] = useState<ProviderInfo | null>(
    null,
  );
  const addToast = useUIStore((s) => s.addToast);

  // API-key providers (OpenCode) run only on the new TS engine; hide them on the
  // Rust engine. Computed once — the engine doesn't change mid-session.
  const visibleProviders = useMemo(
    () => getVisibleProviders({ newEngine: newEngineActive() }),
    [],
  );

  const prevStatuses = useRef<Record<string, ProviderStatus>>({});
  const loadStatuses = useCallback(async () => {
    // Probe every visible provider in parallel. New providers added to the
    // catalog are picked up automatically; never hardcode ids here.
    const results = await Promise.all(
      visibleProviders.map(
        async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const,
      ),
    );
    const next: Record<string, ProviderStatus> = {};
    for (const [id, status] of results) {
      next[id] = status;
    }
    for (const prov of visibleProviders) {
      const wasConnected =
        prevStatuses.current[prov.id]?.cli_installed &&
        prevStatuses.current[prov.id]?.authenticated;
      const isConnected =
        next[prov.id]?.cli_installed && next[prov.id]?.authenticated;
      if (!wasConnected && isConnected) {
        analytics.track("provider_configured", { provider: prov.id });
        onSelect(prov.id, prov.defaultModel);
      }
    }
    prevStatuses.current = next;
    setStatuses(next);
    setLoading(false);
  }, [onSelect, visibleProviders]);

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
        if (
          shouldOpenLoginUrlDirectly({
            isDesktop: osIsTauri(),
            userCode: ev.data.user_code,
          })
        ) {
          // Desktop: the runtime is co-located, so a loopback OAuth flow
          // finishes when the user approves in their OWN browser (the localhost
          // callback flips the card on ProviderLoginComplete). Open the URL and
          // skip the dialog — there is no code to enter. Surface a failed open
          // so the user isn't left on a silent spinner.
          tauriSystem.openUrl(ev.data.url).catch((err) => {
            addToast({
              title: t("toast.signInFailed", {
                provider: prov?.name ?? ev.data.provider,
              }),
              description: err instanceof Error ? err.message : String(err),
              variant: "error",
            });
          });
          return;
        }
        if (prov) {
          // The relay can emit twice for codex's device flow: URL-only,
          // then again carrying the one-time code. Keep a code we've
          // already shown if a later URL-only frame arrives for the same
          // provider.
          setLoginDialog((current) => ({
            provider: prov,
            url: ev.data.url,
            userCode:
              ev.data.user_code ??
              (current?.provider.id === prov.id ? current.userCode : null),
          }));
        }
      } else if (ev.type === "ProviderLoginComplete") {
        const prov = PROVIDERS.find((p) => p.id === ev.data.provider);
        if (ev.data.success) {
          addToast({
            title: t("toast.signInSucceeded", {
              provider: prov?.name ?? ev.data.provider,
            }),
            variant: "success",
          });
        } else if (ev.data.error) {
          // A user cancel completes with `success: false` and no
          // `error` — benign, so we stay quiet and just clear state.
          addToast({
            title: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            description: ev.data.error,
            variant: "error",
          });
        }
        setLoginDialog((current) =>
          current?.provider.id === ev.data.provider ? null : current,
        );
        setPendingId((current) =>
          current === ev.data.provider ? null : current,
        );
        loadStatuses();
      }
    });
    return off;
  }, [addToast, loadStatuses, t]);

  // Start the OAuth device/loopback login for a provider. `enterpriseDomain` is
  // set only when connecting GitHub Copilot Enterprise (from the domain dialog).
  const startOAuthLogin = async (
    provider: ProviderInfo,
    enterpriseDomain?: string,
  ) => {
    setPendingId(provider.id);
    try {
      // launchLogin defaults deviceAuth from the platform — desktop catches the
      // loopback callback (Codex browser login), a remote webapp can't (device
      // code) — so no flag is needed here. Claude keys off the runtime's
      // headless mode regardless.
      // `toast: false`: the catch below renders the provider-specific failure
      // toast, so `call` must not also toast the same message (it showed twice).
      await tauriProvider.launchLogin(provider.id, {
        toast: false,
        enterpriseDomain,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[provider-picker] launchLogin(${provider.id}) failed:`,
        msg,
      );
      addToast({
        title: t("toast.signInFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
      setPendingId(null);
    }
  };

  const handleConnect = async (provider: ProviderInfo) => {
    // API-key providers (OpenCode) connect by pasting a key, not OAuth.
    if (provider.auth === "apiKey") {
      setApiKeyDialog(provider);
      return;
    }
    // GitHub Copilot Enterprise: collect the company GitHub domain first (the
    // device-code flow is domain-specific), then run the same OAuth login with
    // it. Individual Copilot and every other OAuth provider connect straight away.
    if (provider.enterprise) {
      setEnterpriseDialog(provider);
      return;
    }
    await startOAuthLogin(provider);
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
      console.error(
        `[provider-picker] cancelLogin(${provider.id}) failed:`,
        msg,
      );
      addToast({
        title: t("toast.cancelFailed", { provider: provider.name }),
        description: msg,
        variant: "error",
      });
    } finally {
      setPendingId((current) => (current === provider.id ? null : current));
      setLoginDialog((current) =>
        current?.provider.id === provider.id ? null : current,
      );
    }
  };

  const handleSignOut = async (provider: ProviderInfo) => {
    setPendingId(provider.id);
    try {
      await tauriProvider.launchLogout(provider.id);
      await loadStatuses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[provider-picker] launchLogout(${provider.id}) failed:`,
        msg,
      );
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
        {visibleProviders.map((prov) => {
          const status = statuses[prov.id];
          const connected =
            (status?.cli_installed && status?.authenticated) ?? false;
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
        title={t("signOutConfirm.title", {
          provider: confirmSignOutFor?.name ?? "",
        })}
        description={t("signOutConfirm.description", {
          provider: confirmSignOutFor?.name ?? "",
        })}
        confirmLabel={t("signOutConfirm.confirm")}
        cancelLabel={t("signOutConfirm.cancel")}
        variant="destructive"
        onConfirm={() => {
          const target = confirmSignOutFor;
          setConfirmSignOutFor(null);
          if (target) handleSignOut(target);
        }}
      />

      <ProviderLoginDialog
        provider={loginDialog?.provider ?? null}
        url={loginDialog?.url ?? null}
        userCode={loginDialog?.userCode ?? null}
        onClose={() => setLoginDialog(null)}
      />

      <ProviderApiKeyDialog
        provider={apiKeyDialog}
        onClose={() => setApiKeyDialog(null)}
      />

      <ProviderEnterpriseDialog
        provider={enterpriseDialog}
        onClose={() => setEnterpriseDialog(null)}
        onConnect={(domain) => {
          if (enterpriseDialog) void startOAuthLogin(enterpriseDialog, domain);
        }}
      />
    </>
  );
}
