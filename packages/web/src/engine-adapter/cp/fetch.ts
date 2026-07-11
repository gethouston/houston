import { HoustonEngineError } from "../client/errors";
import { refreshLiveToken } from "../session-refresh";

/**
 * Control-plane mode for the web adapter.
 *
 * In cloud, the web app talks to the Houston control plane (not a single local
 * runtime). Agents are REAL — the user's personal workspace, served by
 * `GET/POST/PATCH/DELETE /agents` — and a conversation is proxied to that agent's
 * sandbox via `/agents/:id/conversations/:cid/*`, which mirrors the runtime's own
 * wire contract. So chat reuses the exact same `HoustonEngineClient` + `streamTurn`
 * path; we just point the client at `${baseUrl}/agents/${agentId}`.
 *
 * Auth is the caller's Supabase access token (the control plane verifies it).
 */
export interface ControlPlaneConfig {
  baseUrl: string;
  token: string;
  /**
   * Active hosted space (C8 §Active space). When set it is an org SLUG
   * (`[a-f0-9]{16}`) and every gateway call carries `x-houston-org: <slug>`
   * (and the SSE stream a `?org=<slug>` query); null/absent selects the
   * caller's personal org — the gateway's header-absent default. Mutated in
   * place by `HoustonClient.setActiveOrg`, and read live per request/attempt,
   * so a space switch takes effect without rebuilding the config.
   */
  activeOrgSlug?: string | null;
}

/** The per-agent route prefix the control plane proxies to a pod. */
export const agentPath = (id: string) => `/agents/${encodeURIComponent(id)}`;

/**
 * The current control-plane bearer: the live Supabase access token off the
 * engine global (kept in sync with auth state by CloudApp), falling back to the
 * token captured at construction. Read per request so a silent token refresh is
 * picked up without rebuilding the client.
 */
export function liveToken(fallback: string): string {
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__.token;
  }
  return fallback;
}

/**
 * A `fetch` for gateway calls that keeps auth invisible across cloud restarts
 * (HOU-687): the bearer is read LIVE per attempt (never a pinned copy), and a
 * 401 triggers one single-flight session refresh and one replay with the fresh
 * token. A 401 that survives the refresh is returned as-is — a real sign-out
 * must surface, not spin. With no refresher installed (static tokens, tests)
 * the refresh resolves null and this degrades to a plain live-token fetch.
 */
export function gatewayAuthFetch(
  fallbackToken: string,
  getOrg?: () => string | null | undefined,
): typeof fetch {
  return async (input, init) => {
    const send = (bearer: string) => {
      const headers = new Headers(init?.headers);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      // Active-space header (C8), re-read per attempt so a mid-flight space
      // switch is honored on the next retry/refresh — same live discipline as
      // the bearer. Absent → the gateway resolves the personal org.
      const org = getOrg?.();
      if (org) headers.set("x-houston-org", org);
      return fetch(input, { ...init, headers });
    };
    const res = await send(liveToken(fallbackToken));
    if (res.status !== 401) return res;
    const fresh = await refreshLiveToken();
    if (!fresh) return res;
    return send(fresh);
  };
}

/** Gateway statuses that mean "rolling deploy / pod handoff in progress", not a
 *  real answer: worth a brief blind retry for reads. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
/** Two retries, ~2s total — bridges a gateway roll's LB handoff, without
 *  masking a real outage for long. */
const TRANSIENT_RETRY_DELAYS_MS = [500, 1500];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a fetch so GET/HEAD attempts ride through a rolling deploy / pod
 * handoff: transient gateway statuses and network-level drops (connection
 * refused/reset mid-roll) get two brief blind retries. Writes never
 * blind-retry — a thrown network error on a POST may have reached the
 * gateway; the caller decides.
 */
export function transientRetryFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const retriable = method === "GET" || method === "HEAD";
    let res: Response | undefined;
    let failure: unknown;
    for (let i = 0; ; i++) {
      failure = undefined;
      res = undefined;
      try {
        res = await inner(input, init);
      } catch (err) {
        failure = err;
      }
      const transient = res === undefined || TRANSIENT_STATUSES.has(res.status);
      if (!transient || !retriable || i >= TRANSIENT_RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(TRANSIENT_RETRY_DELAYS_MS[i]);
    }
    if (res === undefined) throw failure;
    return res;
  };
}

/**
 * The shared gateway JSON fetch: live-bearer auth + active-space header + a
 * transient-retry wrapper on reads, with a non-2xx surfaced as a
 * {@link HoustonEngineError} carrying the host's reason. Every control-plane
 * module routes its requests through here.
 */
export async function cpFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const doFetch = transientRetryFetch(
    gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
  );
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    // Surface the real failure (auth, not-found, server) — never swallow.
    const body = await res.json().catch(() => ({}));
    throw new HoustonEngineError(res.status, body);
  }
  return res;
}
