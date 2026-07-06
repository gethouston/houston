import { useCallback, useEffect, useRef, useState } from "react";
import { listenOsEvent } from "../lib/events";
import type { BridgeStatus, SavedBridgeTarget } from "../lib/local-model";
import { sessionOwnsBridge } from "../lib/local-model";
import { reconnectLocalModel } from "../lib/local-model-connect";
import {
  osIsTauri,
  osLocalBridgeStatus,
  osSavedBridgeTarget,
} from "../lib/os-bridge";

export interface LocalBridgeStatus {
  status: BridgeStatus | null;
  /** This machine's saved bridge target, or null (direct/manual endpoint). */
  savedTarget: SavedBridgeTarget | null;
  /** Whether THIS session owns/owned a bridge → show the tunnel pill, not the
   *  standard connected indicator. */
  ownsBridge: boolean;
  /** The local app's name for the offline hint (e.g. "LM Studio"), if known. */
  appName?: string;
  /** Re-establish the tunnel (getTunnelCredentials -> reconnect_local_bridge).
   *  This is the pill's Retry / Reconnect action, NOT a mere status re-read. */
  reconnect: () => void;
  /** A reconnect is in flight (for the pill's disabled/`retrying` state). */
  reconnecting: boolean;
}

/**
 * Live state of the local model bridge for the online/offline pill. Seeds from a
 * one-shot `local_bridge_status` read + a `saved_bridge_target` probe, then
 * tracks the `local-bridge-status` Tauri event the native shell emits on every
 * transition.
 *
 * The pill's Retry actually RECONNECTS the tunnel (mint fresh credentials +
 * `reconnect_local_bridge`, reusing the persisted proxyKey) rather than only
 * re-reading status — after a restart frpc is gone and a status re-read alone
 * would stay offline forever.
 *
 * Desktop only — everything stays null in the browser (there is no bridge
 * there). Pass `enabled: false` to skip subscribing when no local model is
 * connected.
 */
export function useLocalBridgeStatus(enabled = true): LocalBridgeStatus {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [savedTarget, setSavedTarget] = useState<SavedBridgeTarget | null>(
    null,
  );
  const [reconnecting, setReconnecting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!enabled || !osIsTauri()) {
      setStatus(null);
      setSavedTarget(null);
      return () => {
        mounted.current = false;
      };
    }
    // Passive meta-probes (not user-initiated): a transient read failure must
    // not toast. The event stream is the authoritative signal for status.
    osLocalBridgeStatus()
      .then((s) => {
        if (mounted.current) setStatus(s);
      })
      .catch((err) =>
        console.error("[local-bridge] initial status read failed", err),
      );
    osSavedBridgeTarget()
      .then((tgt) => {
        if (mounted.current) setSavedTarget(tgt);
      })
      .catch((err) =>
        console.error("[local-bridge] saved target read failed", err),
      );
    const off = listenOsEvent<BridgeStatus>("local-bridge-status", (s) => {
      if (mounted.current) setStatus(s);
    });
    return () => {
      mounted.current = false;
      off();
    };
  }, [enabled]);

  const reconnect = useCallback(() => {
    if (!enabled || !osIsTauri() || reconnecting) return;
    setReconnecting(true);
    reconnectLocalModel()
      .catch(() => {
        // reconnectLocalModel already toasted the real reason (Report-bug).
      })
      .finally(() => {
        if (mounted.current) setReconnecting(false);
      });
  }, [enabled, reconnecting]);

  return {
    status,
    savedTarget,
    ownsBridge: sessionOwnsBridge(savedTarget, status),
    appName: savedTarget?.appName,
    reconnect,
    reconnecting,
  };
}
