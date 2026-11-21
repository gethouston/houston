import { useCallback, useState } from "react";
import { useLocalBridgeStatus } from "../../hooks/use-local-bridge-status.ts";
import { disconnectLocalModel } from "../../lib/local-model-connect.ts";

export interface ProviderModalLocal {
  showTunnelPill: boolean;
  showConnectedBadge: boolean;
  bridge: ReturnType<typeof useLocalBridgeStatus>["status"];
  bridgeAppName?: string;
  reconnectBridge: () => void;
  reconnecting: boolean;
  disconnecting: boolean;
  disconnectLocal: () => Promise<void>;
}

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
