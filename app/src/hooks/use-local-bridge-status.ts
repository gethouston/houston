import { useCallback, useState, useSyncExternalStore } from "react";
import {
  localBridgeSnapshot,
  subscribeLocalBridge,
} from "../lib/local-bridge-binding";
import { reconnectLocalModel } from "../lib/local-model-connect";
import { osIsTauri } from "../lib/os-bridge";

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
      .catch(() => {})
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
