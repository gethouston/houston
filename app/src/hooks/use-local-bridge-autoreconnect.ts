import { useEffect, useRef } from "react";
import { providerAppearsConnected } from "../components/shell/provider-reconnect-state";
import {
  isBridgeOpInFlight,
  LOCAL_PROVIDER_ID,
  reconnectLocalModel,
} from "../lib/local-model-connect";
import {
  osIsTauri,
  osLocalBridgeStatus,
  osSavedBridgeTarget,
} from "../lib/os-bridge";
import { tauriProvider } from "../lib/tauri";

/**
 * Desktop boot auto-reconnect for the local-model tunnel.
 *
 * The cloud endpoint persists across restarts but frpc does not, so after a
 * relaunch the tunnel is dead with no way for the user to know. On startup, if
 * THIS machine has a saved bridge target AND the agent still has our local-model
 * endpoint active, we quietly re-establish the tunnel (mint credentials ->
 * `reconnect_local_bridge`, reusing the persisted proxyKey). The status pill goes
 * connecting -> online on its own event stream; only a real failure surfaces
 * (the reconnect steps toast with a Report-bug affordance).
 *
 * Runs once per session, desktop only, and only once `enabled` (signed in, engine
 * ready) — `getTunnelCredentials` needs an authenticated hosted session.
 */
export function useLocalBridgeAutoReconnect(enabled: boolean): void {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current || !osIsTauri()) return;
    ran.current = true;

    void (async () => {
      // Only reconnect a tunnel THIS machine owns.
      const savedTarget = await osSavedBridgeTarget().catch((err) => {
        console.error("[local-bridge] boot saved-target read failed", err);
        return null;
      });
      if (!savedTarget) return;

      // A manual connect/reconnect is already running — don't fire a second,
      // redundant lifecycle op (the native side serializes them, but skipping
      // avoids a needless teardown-rebuild). Closes the status-read TOCTOU.
      if (isBridgeOpInFlight()) return;

      // Already up (native side kept it, or a prior mount reconnected)? Nothing
      // to do — never restart a healthy bridge.
      const status = await osLocalBridgeStatus().catch(() => null);
      if (status?.status === "online" || status?.status === "connecting")
        return;

      // Skip the reconnect only when the engine CONFIRMS the endpoint is gone
      // (disconnected from another machine/web — the tunnel would be stale).
      // An unreachable or still-waking engine reports "unknown" (or the probe
      // fails): reconnect anyway. The saved descriptor only exists while the
      // endpoint is registered (explicit disconnect deletes it), and the cold
      // boot right after an app update is exactly when the pod is asleep — a
      // fabricated "not connected" here silently killed the tunnel for good
      // (this hook runs once per session).
      const provider = await tauriProvider
        .checkStatus(LOCAL_PROVIDER_ID)
        .catch(() => null);
      if (provider && !providerAppearsConnected(provider)) return;

      await reconnectLocalModel().catch(() => {
        // reconnectLocalModel already toasted the real reason (Report-bug).
      });
    })();
  }, [enabled]);
}
