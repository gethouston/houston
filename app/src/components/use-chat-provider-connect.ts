import {
  type ConnectionEvidence,
  createProviderConnectionMonitor,
} from "@houston/sdk/provider-connection-observer";
import { useEffect, useRef, useState } from "react";
import { useProviderConnections } from "../hooks/use-provider-connections";
import { logAndReportError } from "../lib/error-report";
import { providerConnectionState } from "../lib/provider-connection";
import { getProvider } from "../lib/providers";
import { tauriProvider } from "../lib/tauri";
import { useWorkspaceStore } from "../stores/workspaces";
import { useIsActiveView } from "./shell/keep-alive-views";

/** Secure dialogs own credentials; the SDK observes only fresh auth evidence. */
export function useChatProviderConnect({
  providerId,
  revisited,
  onConnected,
}: {
  providerId: string;
  revisited: boolean;
  onConnected: (name: string) => void;
}) {
  const active = useIsActiveView();
  const provider = getProvider(providerId);
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const [state, setState] = useState<ConnectionEvidence>("checking");
  const monitor = useRef<ReturnType<
    typeof createProviderConnectionMonitor
  > | null>(null);
  const completed = useRef(false);
  const cancelled = useRef(false);
  const connectedRef = useRef(onConnected);
  connectedRef.current = onConnected;
  const id = provider?.id;
  const name = provider?.name;

  useEffect(() => {
    if (!active || !id || !name || !workspaceId) return;
    setState("checking");
    const current = createProviderConnectionMonitor({
      probe: async () =>
        providerConnectionState(await tauriProvider.checkStatus(id), false),
      onState: setState,
      autoContinue: !revisited,
      initiallyPaused: cancelled.current,
      onConnected: () => {
        if (completed.current) return;
        completed.current = true;
        connectedRef.current(name);
      },
      onError: (error) => logAndReportError("chat_provider_connection", error),
    });
    monitor.current = current;
    return () => {
      current.dispose();
      if (monitor.current === current) monitor.current = null;
    };
  }, [active, id, name, workspaceId, revisited]);

  const start = () => {
    if (!provider) return;
    cancelled.current = false;
    monitor.current?.retry();
    connections.connect(provider);
  };
  const cancelObservation = () => {
    cancelled.current = true;
    monitor.current?.cancel();
  };
  const connections = useProviderConnections({
    active,
    onConnectionCancelled: cancelObservation,
  });
  const cancel = () => {
    cancelObservation();
    if (provider) {
      void connections
        .cancel(provider)
        .catch((error) => logAndReportError("chat_provider_cancel", error));
    }
  };
  const dialogs = connections.dialogProps;
  const dialogOpen = Boolean(
    dialogs.apiKeyDialog ||
      dialogs.loginDialog ||
      dialogs.customEndpointDialog ||
      dialogs.copilotDialogOpen,
  );
  return {
    active,
    provider,
    state,
    start,
    cancel,
    cancelObservation,
    connecting: !!(id && connections.busy[id]),
    dialogOpen,
    dialogProps: dialogs,
  };
}
