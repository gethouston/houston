import { wakingStuckTracker } from "@houston/app/lib/waking-stuck-tracker";
import { appVersionHeader } from "../app-version";
import { HoustonEngineError, SIGNED_OUT_ERROR } from "../client/errors";
import { hasSessionRefresher, refreshLiveToken } from "../session-refresh";
import { transientRetryFetch } from "./transient-retry";

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

/** Inverse of {@link agentPath}: the agent a route is scoped to, or null. */
export function agentIdOfPath(path: string): string | null {
  const match = /^\/agents\/([^/?#]+)/.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

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

/** True in hosted control-plane mode (the cloud web app and the desktop cloud
 *  profile both set the flag). Local hosts never set it, so the signed-out
 *  short-circuit below cannot affect them. */
const inControlPlaneMode = (): boolean =>
  typeof window !== "undefined" &&
  (window as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ === true;

/** The local answer for a hosted call attempted with no session: the same 401
 *  shape a gateway rejection produces, minted WITHOUT a network round trip.
 *  Signed-out is an expected lifecycle state (the sign-in screen is already the
 *  surface), so hammering the gateway with unauthenticated requests would only
 *  produce console/toast noise — and the error-toast layer recognizes this body
 *  and stays quiet (HOU-1014). */
const signedOutResponse = () =>
  new Response(JSON.stringify({ error: SIGNED_OUT_ERROR }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

/**
 * A `fetch` for gateway calls that keeps auth invisible across cloud restarts
 * (HOU-687): the bearer is read LIVE per attempt (never a pinned copy), and a
 * 401 triggers one single-flight session refresh and one replay with the fresh
 * token. A 401 that survives the refresh is returned as-is — a fresh bearer
 * the gateway rejects is a real bug that must surface, not spin. A refresh
 * that answers NULL in hosted mode means the session is terminally gone, and
 * resolves to the same quiet synthetic signed-out 401 as the no-bearer case:
 * signed-out is an expected state and the sign-in screen is its surface. A refresh beaten TRANSIENTLY by the network (a
 * sleep-wake reconnect still settling — HOU-1106) throws the transport-shaped
 * TypeError `refreshLiveToken` mints, exactly as if the request itself had
 * dropped: `transientRetryFetch` re-attempts reads (re-running the refresh
 * each time), and a persistent failure surfaces as connectivity, never as a
 * bogus auth error. With no refresher installed (static tokens, tests) the
 * refresh resolves null and this degrades to a plain live-token fetch.
 *
 * With NO bearer at all in hosted mode the request is not sent: the refresher
 * is asked once (bridging the boot race where queries fire before the restored
 * session's token is mirrored), and when it confirms there is no session the
 * call resolves to a synthetic signed-out 401 locally.
 */
export function gatewayAuthFetch(
  fallbackToken: string,
  getOrg?: () => string | null | undefined,
  getToken?: () => string,
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
      // Build identity: `<semver>+<channel>` on every gateway request, for
      // log/debug attribution (nothing server-side acts on it — the version
      // floor was retired, PRODUCT-1144). Read live off the desktop-installed
      // global — absent (web, tests) means no header, which keeps web fetches
      // preflight-free; every receiving host ignores it.
      const appVersion = appVersionHeader();
      if (appVersion) headers.set("X-Houston-App-Version", appVersion);
      return fetch(input, { ...init, headers });
    };
    // A caller-supplied bearer source (the store seam's session token)
    // outranks the engine-global live token — same live-read discipline.
    const bearer = getToken?.() ?? liveToken(fallbackToken);
    if (!bearer && inControlPlaneMode()) {
      const fresh = await refreshLiveToken();
      if (!fresh) return signedOutResponse();
      return send(fresh);
    }
    const res = await send(bearer);
    if (res.status !== 401) return res;
    const fresh = await refreshLiveToken();
    // An installed refresher answering null in hosted mode is its terminal
    // verdict: the session is gone (HOU-1106's three-valued contract) — the
    // same expected lifecycle state as the no-bearer branch above. Answer with
    // the quiet synthetic instead of the gateway's raw 401 so the burst of
    // live queries caught holding the stale bearer doesn't file a Sentry
    // report per query while the sign-in screen mounts (HOUSTON-APP-4WR).
    // With NO refresher installed null only means "nobody to ask" (static
    // tokens, tests, the pre-mount boot window), so the original 401 stands.
    // A 401 that survives a SUCCESSFUL refresh also returns as-is below — a
    // fresh bearer the gateway rejects is a real bug and must stay loud.
    if (!fresh) {
      return inControlPlaneMode() && hasSessionRefresher()
        ? signedOutResponse()
        : res;
    }
    return send(fresh);
  };
}

/**
 * The shared gateway JSON fetch: live-bearer auth + active-space header + the
 * reason-aware read retry (`./transient-retry` — a rolling deploy gets ~2s of
 * patience, a pod the gateway says is still waking gets a cold-start budget),
 * with a non-2xx surfaced as a {@link HoustonEngineError} carrying the host's
 * reason. Every control-plane module routes its requests through here.
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
  const agentId = agentIdOfPath(path);
  if (!res.ok) {
    // Surface the real failure (auth, not-found, server) — never swallow.
    const body = await res.json().catch(() => ({}));
    const err = new HoustonEngineError(res.status, body);
    if (agentId) err.agentId = agentId;
    throw err;
  }
  // A per-agent call landing is the one signal that ends a stuck-wake episode
  // (PRODUCT-1640): the pod answered, whatever it was doing before.
  if (agentId) wakingStuckTracker.noteSuccess(agentId);
  return res;
}
