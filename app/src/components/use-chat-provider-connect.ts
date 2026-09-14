import {
  type ConnectionEvidence,
  createProviderConnectionMonitor,
} from "@houston/sdk/provider-connection-observer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCapabilities } from "../hooks/use-capabilities";
import { useProviderConnections } from "../hooks/use-provider-connections";
import { newEngineActive } from "../lib/engine";
import { logAndReportError } from "../lib/error-report";
import { osIsTauri } from "../lib/os-bridge";
import {
  cancelProviderConnectStep,
  providerConnectStepCancelled,
  resumeProviderConnectStep,
} from "../lib/provider-connect-cancellation";
import { providerConnectionState } from "../lib/provider-connection";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  providerGatewayIds,
} from "../lib/providers";
import { tauriProvider } from "../lib/tauri";
import { useWorkspaceStore } from "../stores/workspaces";
import { useIsActiveView } from "./shell/keep-alive-views";

/** Secure dialogs own credentials; the SDK observes only fresh auth evidence. */
export function useChatProviderConnect({
  stepId,
  providerId,
  revisited,
  onConnected,
}: {
  /** The interaction step this card is: the unit a cancel is remembered by. */
  stepId: string;
  providerId: string;
  revisited: boolean;
  onConnected: (name: string) => void;
}) {
  const active = useIsActiveView();
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  // Resolve through the GATED connect list, never the raw catalog: a model may
  // request any provider it can read, including the local OpenAI-compatible one
  // a hosted deployment does not serve (`openaiCompatible: false`). A raw
  // lookup gave that card a live Connect that opened the local-model dialog on
  // a host with nowhere to point it; a miss here is simply unavailable, which
  // is what the card already renders. Gateway ids resolve too, so a request for
  // `opencode-go` lands on the merged OpenCode account card.
  const provider = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }).find((p) => providerGatewayIds(p).includes(providerId)) ?? null,
    [newEngine, providerCapabilities, providerId],
  );
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const [state, setState] = useState<ConnectionEvidence>("checking");
  const monitor = useRef<ReturnType<
    typeof createProviderConnectionMonitor
  > | null>(null);
  const completed = useRef(false);
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
      // The cancel lives with the STEP, not with this mount: a sign-in that
      // lands after the user cancelled must not resume the conversation just
      // because the card was rebuilt in between.
      initiallyPaused: providerConnectStepCancelled(stepId),
      onConnected: () => {
        if (completed.current) return;
        completed.current = true;
        resumeProviderConnectStep(stepId);
        connectedRef.current(name);
      },
      onError: (error) => logAndReportError("chat_provider_connection", error),
    });
    monitor.current = current;
    return () => {
      current.dispose();
      if (monitor.current === current) monitor.current = null;
    };
  }, [active, id, name, workspaceId, revisited, stepId]);

  const cancelObservation = () => {
    cancelProviderConnectStep(stepId);
    monitor.current?.cancel();
  };
  const connections = useProviderConnections({
    active,
    onConnectionCancelled: cancelObservation,
  });
  const start = () => {
    if (!provider) return;
    resumeProviderConnectStep(stepId);
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
    dialogOpen,
    dialogProps: dialogs,
  };
}
