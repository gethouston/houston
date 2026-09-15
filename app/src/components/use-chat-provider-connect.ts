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

/** Secure dialogs own credentials; the SDK observes only fresh auth evidence. */
export function useChatProviderConnect({
  stepKey,
  providerId,
  revisited,
  onConnected,
}: {
  /** WHICH request this card renders (`provider-connect-step-memory.ts`): the
   *  unit a cancel and a resume are remembered by, across every rebuild. */
  stepKey: string;
  providerId: string;
  revisited: boolean;
  onConnected: (name: string) => void;
}) {
  const active = useIsActiveView();
  // Resolve through the GATED connect list, never the raw catalog: a raw lookup
  // gave the card a live Connect that opened the local-model dialog on a host
  // with nowhere to point it. A miss here is simply unavailable, which is what
  // the card already renders. Gateway ids resolve too, so a request for
  // `opencode-go` lands on the merged OpenCode account card.
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
  // Whether ANY answer about this provider has landed yet. The card spins only
  // until the first one, never on the `"checking"` a failed probe reports back.
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
      // The cancel lives with the REQUEST, not with this mount: a sign-in that
      // lands after the user cancelled must not resume the conversation just
      // because the card was rebuilt in between.
      initiallyPaused: providerConnectStepCancelled(stepKey),
      // The resume lives with the REQUEST, not with this mount: the interaction
      // is persisted, so the card is rebuilt after the very turn this nudge starts
      // — and a second nudge would start another turn, and another card.
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
