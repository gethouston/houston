import {
  type ConnectionEvidence,
  createProviderConnectionMonitor,
} from "@houston/sdk/provider-connection-observer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectProviders } from "../hooks/use-connect-providers";
import { useProviderConnections } from "../hooks/use-provider-connections";
import { logAndReportError } from "../lib/error-report";
import {
  providerConnectEvidenceSeen,
  providerConnectProbing,
} from "../lib/provider-connect-probe";
import {
  cancelProviderConnectStep,
  claimProviderConnectStepResume,
  providerConnectStepCancelled,
  resumeProviderConnectStep,
} from "../lib/provider-connect-step-memory";
import { providerConnectionState } from "../lib/provider-connection";
import { providerGatewayIds } from "../lib/providers";
import { tauriProvider } from "../lib/tauri";
import { useWorkspaceStore } from "../stores/workspaces";
import { useIsActiveView } from "./shell/keep-alive-views";

export function useChatProviderConnect({
  stepKey,
  providerId,
  revisited,
  onConnected,
}: {
  stepKey: string;
  providerId: string;
  revisited: boolean;
  onConnected: (name: string) => void;
}) {
  const active = useIsActiveView();
  const connectProviders = useConnectProviders();
  const provider = useMemo(
    () =>
      connectProviders.find((p) =>
        providerGatewayIds(p).includes(providerId),
      ) ?? null,
    [connectProviders, providerId],
  );
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const [state, setState] = useState<ConnectionEvidence>("checking");
  const [evidenceSeen, setEvidenceSeen] = useState(false);
  const monitor = useRef<ReturnType<
    typeof createProviderConnectionMonitor
  > | null>(null);
  const connectedRef = useRef(onConnected);
  connectedRef.current = onConnected;
  const id = provider?.id;
  const name = provider?.name;

  useEffect(() => {
    if (!active || !id || !name || !workspaceId) return;
    setState("checking");
    setEvidenceSeen(false);
    const current = createProviderConnectionMonitor({
      probe: async () =>
        providerConnectionState(await tauriProvider.checkStatus(id), false),
      onState: (next) => {
        setState(next);
        setEvidenceSeen((seen) => providerConnectEvidenceSeen(seen, next));
      },
      autoContinue: !revisited,
      initiallyPaused: providerConnectStepCancelled(stepKey),
      onConnected: () => {
        if (!claimProviderConnectStepResume(stepKey)) return;
        resumeProviderConnectStep(stepKey);
        connectedRef.current(name);
      },
      onError: (error) => logAndReportError("chat_provider_connection", error),
    });
    monitor.current = current;
    return () => {
      current.dispose();
      if (monitor.current === current) monitor.current = null;
    };
  }, [active, id, name, workspaceId, revisited, stepKey]);

  const cancelObservation = () => {
    cancelProviderConnectStep(stepKey);
    monitor.current?.cancel();
  };
  const connections = useProviderConnections({
    active,
    onConnectionCancelled: cancelObservation,
  });
  const start = () => {
    if (!provider) return;
    resumeProviderConnectStep(stepKey);
    monitor.current?.retry();
    connections.connect(provider);
  };
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
    probing: providerConnectProbing(state, evidenceSeen),
    dialogOpen,
    dialogProps: dialogs,
  };
}
