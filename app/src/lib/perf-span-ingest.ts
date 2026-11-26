import {
  type GatewayFetchDeps,
  type GatewayRequestInit,
  gatewayFetch,
} from "./gateway-fetch.ts";
import type { PerfSpanObservation } from "./perf-span-types.ts";
import type { MetricsPlatform } from "./platform.ts";

export const CLIENT_METRICS_ROUTE = "/v1/client-metrics";

export interface PerfSpanIngest {
  /** The gateway the spans go to and the session bearer they ride. */
  gateway: GatewayFetchDeps;
  platform: MetricsPlatform;
  appVersion: string;
}

type Send = (
  deps: GatewayFetchDeps,
  path: string,
  init: GatewayRequestInit,
) => Promise<Response | null>;

/**
 * The gateway POST behind `PerfSpanTransport.send`, through `gatewayFetch` so
 * it keeps the gateway's bearer and refresh rules. It throws for every batch
 * not delivered, so the queue re-queues it: the board span routinely beats
 * the session load, and dropping it then under-counted the journey that
 * matters most. A 404 is an older gateway without the ingest: delivered.
 */
export function createPerfSpanSend(
  ingest: PerfSpanIngest,
  send: Send = gatewayFetch,
): (spans: PerfSpanObservation[]) => Promise<void> {
  return async (spans) => {
    if (!ingest.gateway.token()) throw new Error("session not ready");
    const res = await send(ingest.gateway, CLIENT_METRICS_ROUTE, {
      method: "POST",
      // User-scoped: an org pin would make the gateway resolve (and gate on)
      // a team before the handler, and the histograms carry no org.
      orgScoped: false,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        spans: spans.map((s) => ({
          ...s,
          platform: ingest.platform,
          appVersion: ingest.appVersion,
        })),
      }),
    });
    if (!res) throw new Error("session not ready");
    if (!res.ok && res.status !== 404)
      throw new Error(`client-metrics rejected: ${res.status}`);
  };
}

/** The live gateway deps for the ingest at `baseUrl`, bearing `token`. */
export function liveIngestGateway(
  baseUrl: string,
  token: () => string | undefined,
): GatewayFetchDeps {
  return {
    baseUrl,
    token,
    refresh: async () => (await window.__HOUSTON_SESSION_REFRESH__?.()) ?? null,
    // The body already names the version per span, so the request keeps the
    // headers this ingest has always received.
    appVersion: () => null,
    fetchFn: (input, init) => fetch(input, init),
  };
}
