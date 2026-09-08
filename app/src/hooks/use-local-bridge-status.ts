import { useCallback, useState, useSyncExternalStore } from "react";
import {
  localBridgeSnapshot,
  subscribeLocalBridge,
} from "../lib/local-bridge-binding";
import { reconnectLocalModel } from "../lib/local-model-connect";
import { osIsTauri } from "../lib/os-bridge";

/** The product observes the SDK snapshot; the native event subscription is shared. */
export function useLocalBridgeStatus(enabled = true) {
  const snapshot = useSyncExternalStore(
    subscribeLocalBridge,
    localBridgeSnapshot,
    localBridgeSnapshot,
  );
  const [reconnecting, setReconnecting] = useState(false);
  const reconnect = useCallback(() => {
    if (!enabled || reconnecting || !osIsTauri()) return;
    setReconnecting(true);
    void reconnectLocalModel()
      .catch(() => {
        // The action reports through the app's standard error paths.
      })
      .finally(() => setReconnecting(false));
  }, [enabled, reconnecting]);
  const active = enabled && osIsTauri();
  const target = active ? (snapshot.journal?.input ?? null) : null;
  return {
    status: active ? { status: snapshot.status } : null,
    savedTarget: target,
    ownsBridge:
      active &&
      (snapshot.journal !== null || !["disabled"].includes(snapshot.status)),
    appName: target?.appName,
    reconnect,
    reconnecting: reconnecting || snapshot.status === "reconnecting",
  };
}
