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

export function useProviderConnections(options?: {
  alwaysActive?: boolean;
  active?: boolean;
  onConnectionCancelled?: () => void;
}): ProviderConnections {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const providerSurfaceActive = useUIStore(
    (s) =>
      options?.active ??
      (options?.alwaysActive ||
        isActiveTopLevelView(s.viewMode, AI_HUB_VIEW_ID)),
  );
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);

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

  const [pending, setPending] = useState<ProviderPending | null>(null);
  const [confirmSignOutFor, setConfirmSignOutFor] =
    useState<ProviderInfo | null>(null);
  const [loginDialog, setLoginDialog] =
    useState<ProviderLoginDialogState | null>(null);
  const [apiKeyDialog, setApiKeyDialog] = useState<ProviderInfo | null>(null);
  const [customEndpointDialog, setCustomEndpointDialog] =
    useState<ProviderInfo | null>(null);
  const {
    begin: beginCopilot,
    dialog: copilotDialog,
    open: copilotDialogOpen,
  } = useCopilotConnect(options?.onConnectionCancelled);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

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

  const { connectionState } = useConnectionReaders(statuses, loading);

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
      copilotDialogOpen,
    }),
    [
      confirmSignOutFor,
      loginDialog,
      apiKeyDialog,
      customEndpointDialog,
      copilotDialog,
      copilotDialogOpen,
      signOutConfirmed,
    ],
  );

  return {
    statuses,
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
