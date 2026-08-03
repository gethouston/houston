import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { osLaunchT0Ms } from "../lib/os-bridge";
import { type PerfSpanObservation, perfSpans } from "../lib/perf-spans";
import { currentPlatformOs } from "../lib/platform";
import { useSession } from "./use-session";

/**
 * Where client perf spans land: the public gateway's `/v1/client-metrics`
 * ingest (session-authed; the gateway folds them into Prometheus histograms
 * for grafana.gethouston.ai). Same target in local-sidecar AND gateway-fronted
 * modes — the route is gateway-owned, never proxied to a pod.
 */
const CLIENT_METRICS_URL = (
  (import.meta.env?.VITE_CLIENT_METRICS_GATEWAY_URL as string | undefined) ??
  "https://gateway.gethouston.ai"
).replace(/\/+$/, "");

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/**
 * Wires the perf-span singleton (HOU-1011): upgrades T0 to the Tauri shell's
 * process-start stamp, and installs the transport once a session exists —
 * signed-out installs keep measuring but only mirror to PostHog (the gateway
 * ingest requires a user). Mount once in `<App/>`, like the other one-shot
 * app-level subscribers.
 */
export function usePerfSpans(): void {
  const { data: session } = useSession();
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.idToken ?? null;

  useEffect(() => {
    void osLaunchT0Ms().then((t0) => {
      if (t0 !== null) perfSpans.setLaunchT0(t0);
    });
    perfSpans.configure({
      async send(spans: PerfSpanObservation[]) {
        const token = tokenRef.current;
        // No session yet → throw so PerfSpans RE-QUEUES the batch (bounded)
        // instead of counting it delivered. The earliest span of a session
        // (app_to_board) routinely beats the async session load — dropping
        // here silently under-counted exactly the journey we care most about.
        // The token-arrival effect below re-flushes the queue.
        if (!token) throw new Error("session not ready");
        const res = await fetch(`${CLIENT_METRICS_URL}/v1/client-metrics`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            spans: spans.map((s) => ({
              ...s,
              platform: currentPlatformOs,
              appVersion: APP_VERSION,
            })),
          }),
        });
        // 404 = older gateway without the ingest; treat as delivered.
        if (!res.ok && res.status !== 404)
          throw new Error(`client-metrics rejected: ${res.status}`);
      },
      mirror(span, ms) {
        analytics.track("perf_span", { span, duration_ms: ms });
      },
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") void perfSpans.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Session arrived after early spans were measured (the common cold-start
  // order): drain the re-queued batches now instead of waiting for the next
  // observation to schedule a flush.
  const token = session?.idToken ?? null;
  useEffect(() => {
    if (token) void perfSpans.flush();
  }, [token]);
}
