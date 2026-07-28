import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { providerIsAuthenticated } from "../components/shell/provider-reconnect-state";
import { useCopilotConnect } from "../components/shell/use-copilot-connect";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../lib/providers";
import { AI_HUB_VIEW_ID, isActiveTopLevelView } from "../lib/top-level-views";
import { useUIStore } from "../stores/ui";
import type {
  ProviderConnections,
  ProviderLoginDialogState,
  ProviderPending,
} from "./provider-connections/types";
import { useConnectionReaders } from "./provider-connections/use-connection-readers";
import { useProviderConnectActions } from "./provider-connections/use-provider-connect-actions";
import { useProviderLoginEvents } from "./provider-connections/use-provider-login-events";
import { useProviderStatuses } from "./provider-connections/use-provider-statuses";
import { useCapabilities } from "./use-capabilities";

export type {
  ProviderConnectionDialogProps,
  ProviderConnections,
} from "./provider-connections/types";

/**
 * The shared provider-connections layer for the AI models hub. A faithful
 * extraction of the connection logic that lived inline in
 * `provider-settings.tsx`, exposed as a reusable hook so the hub view (and its
 * dialog stack) can drive connect / sign-out without owning any of the
 * event/async plumbing. See `ProviderConnections` for the public surface.
 *
 * Status probing, the OAuth event relay, and the connect actions are split into
 * `./provider-connections/*` to keep each unit small; this file composes them and
 * owns the dialog state.
 *
 * Rendered once by the hub view; `dialogProps` feeds a single
 * `<ProviderConnectionDialogs>`.
 */
export function useProviderConnections(options?: {
  /** Non-top-level flows unmount when hidden, so they own login events while mounted. */
  alwaysActive?: boolean;
}): ProviderConnections {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const providerSurfaceActive = useUIStore(
    (s) =>
      options?.alwaysActive || isActiveTopLevelView(s.viewMode, AI_HUB_VIEW_ID),
  );
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);

  // API-key providers run only on the new TS engine; the merged OpenCode card
  // stands in for both its gateways. Computed once — the engine doesn't change
  // mid-session.
  const visibleProviders = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );

  const { statuses, loading, probed, loadStatuses, patchAuthState } =
    useProviderStatuses(visibleProviders);

  // Only one provider is ever mid-flight; `mode` distinguishes a connect spinner
  // from a sign-out spinner for the `busy` map.
  const [pending, setPending] = useState<ProviderPending | null>(null);
  const [confirmSignOutFor, setConfirmSignOutFor] =
    useState<ProviderInfo | null>(null);
  const [loginDialog, setLoginDialog] =
    useState<ProviderLoginDialogState | null>(null);
  const [apiKeyDialog, setApiKeyDialog] = useState<ProviderInfo | null>(null);
  const [customEndpointDialog, setCustomEndpointDialog] =
    useState<ProviderInfo | null>(null);
  const { begin: beginCopilot, dialog: copilotDialog } = useCopilotConnect();

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // While a connect is pending on its visible owner, poll so the card flips to
  // connected once the credential lands (ProviderLoginComplete is primary).
  // The AI Models hub (the one top-level provider surface since HOU-789) stays
  // mounted while hidden, so its local backstop must not keep issuing reads
  // after the user leaves it.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pending && providerSurfaceActive) {
      pollRef.current = setInterval(loadStatuses, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pending, providerSurfaceActive, loadStatuses]);

  useEffect(() => {
    if (!pending) return;
    const status = statuses[pending.id];
    // Confirmed-only: an "unknown" probe (engine unreachable mid-poll) must
    // not clear a pending connect as if it had completed.
    if (status && providerIsAuthenticated(status)) {
      setPending(null);
    }
  }, [pending, statuses]);

  useProviderLoginEvents({
    active: providerSurfaceActive,
    visibleProviders,
    addToast,
    t,
    loadStatuses,
    patchAuthState,
    setLoginDialog,
    setPending,
  });

  const { connect, cancel, signOutConfirmed } = useProviderConnectActions({
    addToast,
    t,
    loadStatuses,
    patchAuthState,
    beginCopilot,
    setPending,
    setLoginDialog,
    setApiKeyDialog,
    setCustomEndpointDialog,
  });

  // The ONE connection reader, from the ONE shared derivation (HOU-979).
  const { connectionState } = useConnectionReaders(statuses, loading);

  // `signOut` opens the confirm; the actual logout runs on confirm.
  const signOut = useCallback((p: ProviderInfo) => setConfirmSignOutFor(p), []);

  const busy = useMemo<Record<string, "connecting" | "signingOut" | undefined>>(
    () => (pending ? { [pending.id]: pending.mode } : {}),
    [pending],
  );

  const dialogProps = useMemo(
    () => ({
      confirmSignOutFor,
      onConfirmSignOutOpenChange: (open: boolean) => {
        if (!open) setConfirmSignOutFor(null);
      },
      onConfirmSignOut: () => {
        const target = confirmSignOutFor;
        setConfirmSignOutFor(null);
        if (target) void signOutConfirmed(target);
      },
      loginDialog,
      onCloseLoginDialog: () => setLoginDialog(null),
      apiKeyDialog,
      onCloseApiKeyDialog: () => setApiKeyDialog(null),
      customEndpointDialog,
      onCloseCustomEndpointDialog: () => setCustomEndpointDialog(null),
      copilotDialog,
    }),
    [
      confirmSignOutFor,
      loginDialog,
      apiKeyDialog,
      customEndpointDialog,
      copilotDialog,
      signOutConfirmed,
    ],
  );

  return {
    statuses,
    // `loading` is true until the first full status probe resolves; the hub
    // gates its actionable Connect affordances on `ready` so a slow probe can't
    // flash a live Connect button on an already-connected provider.
    ready: !loading,
    probed,
    refresh: loadStatuses,
    connectionState,
    connect,
    cancel,
    signOut,
    busy,
    dialogProps,
  };
}
