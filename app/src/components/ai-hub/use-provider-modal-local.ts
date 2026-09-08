/**
 * The LOCAL-model half of the provider modal: the bridge's live online/offline
 * state and a disconnect that revokes and closes the owned connection.
 *
 * Extracted from `provider-modal.tsx` so that file stays a composition of a
 * header, a model list and a footer. The SDK binds bridge ownership to the
 * signed-in account, workspace, agent and registered device.
 */

import { useCallback, useState } from "react";
import { useLocalBridgeStatus } from "../../hooks/use-local-bridge-status.ts";
import { disconnectLocalModel } from "../../lib/local-model-connect.ts";

export interface ProviderModalLocal {
  /** Show the tunnel pill: THIS session owns/owned the bridge. */
  showTunnelPill: boolean;
  /**
   * Show the green Connected badge. A session-owned tunnel reports its state
   * through the pill instead, so the two never stack.
   */
  showConnectedBadge: boolean;
  /** The bridge's live state, for the pill. */
  bridge: ReturnType<typeof useLocalBridgeStatus>["status"];
  /** The local app's name (e.g. "LM Studio") for the offline hint. */
  bridgeAppName?: string;
  reconnectBridge: () => void;
  reconnecting: boolean;
  /** A local disconnect is in flight. */
  disconnecting: boolean;
  disconnectLocal: () => Promise<void>;
}

/**
 * `isLocal` is the provider kind; `connected` is whether THIS modal's account is
 * confirmed connected. A direct/manual endpoint (or a tunnel another machine
 * manages) owns no bridge here and so reads as normally connected instead.
 */
export function useProviderModalLocal(opts: {
  isLocal: boolean;
  connected: boolean;
  onDisconnected: () => void;
}): ProviderModalLocal {
  const {
    status: bridge,
    ownsBridge,
    appName: bridgeAppName,
    reconnect: reconnectBridge,
    reconnecting,
  } = useLocalBridgeStatus(opts.isLocal);
  const [disconnecting, setDisconnecting] = useState(false);
  const { onDisconnected } = opts;
  const disconnectLocal = useCallback(async () => {
    setDisconnecting(true);
    try {
      await disconnectLocalModel();
      onDisconnected();
    } catch {
      // disconnectLocalModel already toasted the real reason (Report-bug).
    } finally {
      setDisconnecting(false);
    }
  }, [onDisconnected]);

  return {
    showTunnelPill: opts.isLocal && ownsBridge,
    showConnectedBadge: opts.connected && (!opts.isLocal || !ownsBridge),
    bridge,
    bridgeAppName,
    reconnectBridge,
    reconnecting,
    disconnecting,
    disconnectLocal,
  };
}
