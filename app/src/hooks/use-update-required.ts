import { useEffect, useRef, useState } from "react";
import { analytics } from "../lib/analytics";
import {
  getEngine,
  isHostedGatewayEngine,
  whenEngineReady,
} from "../lib/engine";
import {
  currentAppVersion,
  emitUpdateRequired,
  minVersionSignal,
  onUpdateRequired,
  type UpdateRequiredSignal,
} from "../lib/update-floor";

/**
 * The hard app-update floor (hosted gateway): non-null once the gateway said
 * this build is too old — via a 426 on any request, or a `minAppVersion` on
 * `/v1/version`. Kept BESIDE the updater status, not as another status state,
 * so the blocking screen can stay up while the normal updater machine
 * underneath it runs through available → downloading → ready. Never cleared:
 * only an installed update (relaunch) can satisfy the floor.
 */
export function useUpdateRequired(
  runCheck: () => void | Promise<void>,
): UpdateRequiredSignal | null {
  const [required, setRequired] = useState<UpdateRequiredSignal | null>(null);
  const requiredRef = useRef<UpdateRequiredSignal | null>(null);

  // Trigger 1 — the transport saw a gateway `426 Upgrade Required` (forwarded
  // through the update-floor bus). Merge rather than replace: a later signal
  // with an omitted field (e.g. the /v1/version probe has no updateUrl) must
  // not erase a value an earlier 426 body carried.
  useEffect(() => {
    return onUpdateRequired((signal) => {
      const prev = requiredRef.current;
      const next: UpdateRequiredSignal = {
        minVersion: signal.minVersion ?? prev?.minVersion ?? null,
        updateUrl: signal.updateUrl ?? prev?.updateUrl ?? null,
      };
      requiredRef.current = next;
      setRequired(next);
      if (!prev) {
        analytics.track("update_required", {
          from_version: currentAppVersion(),
          min_version: next.minVersion ?? "unknown",
        });
        // Kick a check right away so the blocking screen can offer the
        // one-click install instead of waiting for the next tick. In dev /
        // with the updater unable to serve, this rejects into runCheck's catch
        // and the screen falls back to the gateway-provided updateUrl.
        void runCheck();
      }
    });
  }, [runCheck]);

  // Trigger 2 — early warning: the gateway's `/v1/version` (exempt from the
  // floor's 426) names a `minAppVersion` only when a floor is enforced for
  // this channel. One probe per app run, at connect: a floor raised
  // mid-session is caught by the 426 path on the next request anyway. Hosted
  // gateway only — the local sidecar's /v1/version never carries the field,
  // so skipping it saves a wasted request on every desktop launch.
  useEffect(() => {
    if (!isHostedGatewayEngine()) return;
    let cancelled = false;
    void whenEngineReady()
      .then(() => getEngine().version())
      .then((v) => {
        if (cancelled) return;
        const signal = minVersionSignal(v, currentAppVersion());
        if (signal) emitUpdateRequired(signal);
      })
      .catch(() => {
        /* meta probe only — a failure must not surface; the 426 path covers */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return required;
}
