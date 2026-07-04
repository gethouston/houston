import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { providerAppearsConnected } from "../components/shell/provider-reconnect-state";
import { useCopilotConnect } from "../components/shell/use-copilot-connect";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../lib/providers";
import { useUIStore } from "../stores/ui";
import type {
  ProviderConnections,
  ProviderLoginDialogState,
  ProviderPending,
} from "./provider-connections/types";
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
export function useProviderConnections(): ProviderConnections {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
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

  const { statuses, loading, loadStatuses, patchAuthState } =
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

  // While a connect is pending, poll so the card flips to connected once the
  // CLI credential file lands (the ProviderLoginComplete event is the primary
  // signal; this is the backstop).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pending) {
      pollRef.current = setInterval(loadStatuses, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pending, loadStatuses]);

  useEffect(() => {
    if (!pending) return;
    const status = statuses[pending.id];
    if (status && providerAppearsConnected(status)) {
      setPending(null);
    }
  }, [pending, statuses]);

  useProviderLoginEvents({
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

  const isConnected = useCallback(
    (p: ProviderInfo) => {
      const s = statuses[p.id];
      return s ? providerAppearsConnected(s) : false;
    },
    [statuses],
  );

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
    refresh: loadStatuses,
    isConnected,
    connect,
    cancel,
    signOut,
    busy,
    dialogProps,
  };
}
