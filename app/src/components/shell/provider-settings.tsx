import type { HoustonEvent } from "@houston-ai/core";
import { ConfirmDialog, Spinner } from "@houston-ai/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { newEngineActive } from "../../lib/engine";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import {
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
import { OpenAiCompatibleDialog } from "./openai-compatible-dialog";
import { ProviderAccountRow } from "./provider-account-row";
import { ProviderApiKeyDialog } from "./provider-api-key-dialog";
import { ProviderLoginDialog } from "./provider-login-dialog";
import { shouldOpenLoginUrlDirectly } from "./provider-login-url";
import { providerAppearsConnected } from "./provider-reconnect-state";
import { useCopilotConnect } from "./use-copilot-connect";

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
  const [confirmSignOutFor, setConfirmSignOutFor] =
    useState<ProviderInfo | null>(null);
  // OAuth URL surfaced by the engine when the CLI couldn't open the
  // user's browser itself (remote/headless deployments). `userCode` is
  // set for codex's device-grant flow (the one-time code to enter on
  // OpenAI's page); null for Claude's paste-back flow. Cleared on
  // ProviderLoginComplete or when the user closes the dialog.
  const [loginDialog, setLoginDialog] = useState<{
    provider: ProviderInfo;
    url: string;
    userCode: string | null;
  } | null>(null);
  // The paste-a-key dialog for API-key providers (OpenCode Zen / Go).
  const [apiKeyDialog, setApiKeyDialog] = useState<ProviderInfo | null>(null);
  // GitHub Copilot's connect opens a Personal vs Company plan dialog.
  const { begin: beginCopilot, dialog: copilotDialog } = useCopilotConnect();
  // The base-URL + model dialog for an OpenAI-compatible (local) server.
  const [customEndpointDialog, setCustomEndpointDialog] =
    useState<ProviderInfo | null>(null);
  const addToast = useUIStore((s) => s.addToast);

  // API-key providers run only on the new TS engine; hide them on the Rust
  // engine where they can't connect. Computed once — the engine doesn't change
  // mid-session.
  const visibleProviders = useMemo(
    () =>
      getVisibleProviders({
        newEngine: newEngineActive(),
        desktop: osIsTauri(),
      }),
    [],
  );

  // First scan is treated as the baseline so opening Settings while a
  // provider is already connected doesn't fire a fake "X connected" toast.
  // Subsequent scans react to transitions normally.
  const hasBaseline = useRef(false);
  const prevStatuses = useRef<Record<string, ProviderStatus>>({});
  const loadStatuses = useCallback(async () => {
    const results = await Promise.all(
      visibleProviders.map(async (p) => {
        const status = await tauriProvider.checkStatus(p.id);
        // Paint each card the moment ITS probe resolves instead of blocking
        // every card on the slowest provider — each CLI shell-out can take
        // up to its 5s timeout, and gating the whole batch made the section
        // feel frozen for ~6s after connect/sign-out.
        setStatuses((prev) => ({ ...prev, [p.id]: status }));
        return [p.id, status] as const;
      }),
    );
    const next: Record<string, ProviderStatus> = {};
    for (const [id, status] of results) {
      next[id] = status;
    }
    if (hasBaseline.current) {
      for (const prov of visibleProviders) {
        const prev = prevStatuses.current[prov.id];
        const cur = next[prov.id];
        const wasConnected = prev ? providerAppearsConnected(prev) : false;
        const isConnected = cur ? providerAppearsConnected(cur) : false;
        if (!wasConnected && isConnected) {
          analytics.track("provider_configured", { provider: prov.id });
        }
      }
    }
    prevStatuses.current = next;
    hasBaseline.current = true;
    setLoading(false);
  }, [visibleProviders]);

  // Optimistically reflect an auth outcome we already know succeeded (a
  // completed connect or sign-out) so the card flips immediately instead of
  // waiting on the multi-second CLI re-probe. loadStatuses still runs and
  // reconciles against the real probe.
  const patchAuthState = useCallback(
    (providerId: string, authenticated: boolean) => {
      setStatuses((prev) => {
        const existing = prev[providerId];
        return {
          ...prev,
          [providerId]: {
            provider: existing?.provider ?? providerId,
            cli_name: existing?.cli_name ?? "",
            cli_installed: existing?.cli_installed ?? true,
            auth_state: authenticated ? "authenticated" : "unauthenticated",
            authenticated,
          },
        };
      });
    },
    [],
  );

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
    if (status && providerAppearsConnected(status)) {
      setPendingId(null);
    }
  }, [pendingId, statuses]);

  // OAuth URL relay for remote/headless engines (Docker container,
  // Always-On VPS). When the engine spawns claude/codex login and the
  // CLI can't open the user's browser, it surfaces the fallback URL
  // via `ProviderLoginUrl`. We show <ProviderLoginDialog> with the
  // URL + a paste-code field. `ProviderLoginComplete` closes the
  // dialog and refreshes provider status. The status-poll effect
  // above flips the chip to Connected once the CLI's credential file
  // lands. Functional setState avoids stale-closure reads on
  // loginDialog / pendingId — multiple providers could fire events
  // concurrently and we only want to clear state for the one the
  // event names.
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
          // Flip the card to connected immediately; loadStatuses reconciles.
          patchAuthState(ev.data.provider, true);
        } else if (ev.data.error) {
          addToast({
            title: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            description: ev.data.error,
            variant: "error",
          });
        }
        // Only clear the dialog if it's showing THIS provider's URL —
        // a completion for a different provider must not clobber an
        // in-flight sign-in.
        setLoginDialog((current) =>
          current?.provider.id === ev.data.provider ? null : current,
        );
        // Same rule for the spinner-tracking pending id: on failure
        // the status poll won't ever see authenticated, so without
        // this clear the row would spin forever.
        setPendingId((current) =>
          current === ev.data.provider ? null : current,
        );
        loadStatuses();
      }
    });
    return off;
  }, [addToast, loadStatuses, patchAuthState, t]);

  // Start the OAuth login. `enterpriseDomain` is set only for GitHub Copilot
  // Enterprise (collected by the dialog the hook drives).
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
        `[provider-settings] launchLogin(${provider.id}) failed:`,
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
    // API-key providers (OpenCode) connect by pasting a key, not OAuth — open
    // the key dialog instead of launching a browser sign-in.
    if (provider.auth === "apiKey") {
      setApiKeyDialog(provider);
      return;
    }
    // OpenAI-compatible (local) servers connect by base URL + model.
    if (provider.auth === "openaiCompatible") {
      setCustomEndpointDialog(provider);
      return;
    }
    // GitHub Copilot: open the Personal vs Company plan dialog first; the chosen
    // plan resumes the login with the right domain (Company) or none (Personal).
    if (
      beginCopilot(provider, (domain) => void startOAuthLogin(provider, domain))
    )
      return;
    await startOAuthLogin(provider);
  };

  const handleCancel = async (provider: ProviderInfo) => {
    // Abort the engine-side login subprocess so the slot frees up and a
    // retry isn't rejected as "already pending". Clear the spinner
    // optimistically; the engine's benign ProviderLoginComplete (handled
    // above) is the backstop.
    try {
      await tauriProvider.cancelLogin(provider.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[provider-settings] cancelLogin(${provider.id}) failed:`,
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
      // Logout succeeded — flip the card to disconnected now rather than
      // blocking the spinner on the several-second re-probe. loadStatuses
      // reconciles in the background.
      patchAuthState(provider.id, false);
      void loadStatuses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[provider-settings] launchLogout(${provider.id}) failed:`,
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

  // Connected providers float to the top so the user lands on what's
  // already working. Within each group we preserve `PROVIDERS` order — the
  // catalog is the source of truth for "which brand should be more prominent
  // when nothing is connected yet," and we don't want connect/disconnect to
  // shuffle siblings around each other.
  const orderedProviders = useMemo(() => {
    const connected: ProviderInfo[] = [];
    const disconnected: ProviderInfo[] = [];
    for (const p of visibleProviders) {
      const s = statuses[p.id];
      if (s && providerAppearsConnected(s)) connected.push(p);
      else disconnected.push(p);
    }
    return [...connected, ...disconnected];
  }, [statuses, visibleProviders]);

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
          const connected = status ? providerAppearsConnected(status) : false;
          return (
            <ProviderAccountRow
              key={prov.id}
              provider={prov}
              connected={connected}
              pending={pendingId === prov.id}
              onConnect={() => handleConnect(prov)}
              onSignOut={() => setConfirmSignOutFor(prov)}
              onCancel={() => handleCancel(prov)}
            />
          );
        })}
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

      {copilotDialog}

      <OpenAiCompatibleDialog
        provider={customEndpointDialog}
        onClose={() => setCustomEndpointDialog(null)}
      />
    </>
  );
}
