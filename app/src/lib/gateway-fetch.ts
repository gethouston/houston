/**
 * The ONE way app code talks to the Houston cloud gateway.
 *
 * Three call sites used to hand-roll this (account deletion, the cloud-migration
 * wizard, the onboarding-survey store), each with a slightly different subset of
 * the rules. The canonical implementation is the engine adapter's
 * `gatewayAuthFetch` (`packages/web/src/engine-adapter/cp/fetch.ts`), which app
 * code cannot import — `@houston-ai/engine-client` does not export it and the
 * package boundary (`pnpm check:boundaries`) is the point. So this is its
 * app-side peer, and it keeps parity on all four rules:
 *
 *  1. LIVE BEARER — read per attempt, never a pinned copy, so a silent token
 *     refresh is picked up without rebuilding anything.
 *  2. 401 → one refresh, one replay. A 401 that survives the refresh is handed
 *     back as-is: a real sign-out must surface, not spin. A refresh beaten
 *     TRANSIENTLY by the network throws a transport-shaped `TypeError` instead
 *     (HOU-1106), so a settling reconnect reads as connectivity, not auth.
 *     Concurrent callers share ONE refresh, because refresh tokens rotate on
 *     use and racing mints can invalidate each other (`./gateway-refresh.ts`,
 *     this repo's mirror of the canonical `session-refresh.ts`).
 *  3. ACTIVE SPACE — `x-houston-org: <slug>` whenever a team space is pinned
 *     (C8), read live per attempt off the same global the engine adapter uses.
 *     Absent ⇒ the gateway resolves the caller's personal space, which is what
 *     404'd every org-scoped `/agents/:slug/migration/*` call from a team.
 *     A USER-scoped route opts out per request ({@link GatewayRequestInit}).
 *  4. BUILD IDENTITY — `X-Houston-App-Version: <semver>+<channel>` on every
 *     request, riding the window global `app/src/lib/app-version.ts` installs
 *     (desktop only: a browser tab must never send the header, which would
 *     force a CORS preflight every target would have to allow). Nothing
 *     server-side acts on it since the version floor was retired
 *     (PRODUCT-1144); it remains for log/debug attribution.
 *
 * Dependency-injected end to end so `app/tests` drives it with no window and no
 * network.
 */

import { refreshGatewayBearer } from "./gateway-refresh.ts";

export interface GatewayRequestInit extends RequestInit {
  /**
   * Whether this request belongs to the ACTIVE SPACE — i.e. whether it carries
   * the `x-houston-org` pin. Defaults to TRUE, the canonical `cp/fetch`
   * semantics and the right answer for anything under `/agents/:slug/*`.
   *
   * Set it FALSE for a route that is USER-scoped, because the header does not
   * merely go unread there — it changes the answer. The gateway resolves the
   * pin BEFORE the handler (`ResolveOrg`) and derives the write gate's billing
   * from whatever it resolved (`gateWrites`), so a plain member of an expired
   * team would get a silent 403 on their own `/v1/me/*` write, and a stale slug
   * a 403 `not_member` on their own read. Same reasoning as the web shim's
   * `/feedback` call: personal data must not be hostage to a team's state.
   */
  orgScoped?: boolean;
}

export interface GatewayFetchDeps {
  /** Gateway base URL (a trailing slash is stripped). */
  baseUrl: string;
  /** The current bearer, read fresh per attempt. */
  token: () => string | undefined;
  /** Mint a fresh bearer; resolves null when the session is terminally gone,
   *  and REJECTS when the identity service was merely unreachable. */
  refresh: () => Promise<string | null>;
  fetchFn: typeof fetch;
  /** The pinned team space's org slug, or null/undefined for the personal
   *  space (no header). Defaults to the app-installed global. */
  org?: () => string | null | undefined;
  /** The `X-Houston-App-Version` value, or null to send no header. Defaults to
   *  the desktop-installed global. */
  appVersion?: () => string | null;
}

function installedAppVersion(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_APP_VERSION__ ?? null;
}

/** The active space (C8), from the global `lib/engine.ts`'s `setActiveOrg`
 *  writes — the same single source the engine client reads for its own
 *  `x-houston-org`, so both transports switch spaces together. */
function installedActiveOrg(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_ACTIVE_ORG__ ?? null;
}

/**
 * Send one authenticated gateway request. Resolves to the response (including
 * an unauthorized or failing one — the caller owns what a status means), or to
 * `null` when there is NO session at all: signed out is an expected lifecycle
 * state, and hammering the gateway with unauthenticated requests would only
 * produce noise. Transport failures reject, exactly as `fetch` does.
 */
export async function gatewayFetch(
  deps: GatewayFetchDeps,
  path: string,
  init?: GatewayRequestInit,
): Promise<Response | null> {
  const { orgScoped = true, ...request } = init ?? {};
  const url = `${deps.baseUrl.replace(/\/+$/, "")}${path}`;
  const send = (bearer: string) => {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearer}`);
    // Re-read per attempt, like the bearer: a space switch mid-flight is
    // honoured by the replay rather than answering for the previous tenant.
    const org = orgScoped ? (deps.org ?? installedActiveOrg)() : null;
    if (org) headers.set("x-houston-org", org);
    const version = (deps.appVersion ?? installedAppVersion)();
    if (version) headers.set("X-Houston-App-Version", version);
    return deps.fetchFn(url, { ...request, headers });
  };
  // No bearer yet is not always signed out: boot can fire a call before the
  // restored session's token is mirrored, so the refresher is asked once.
  const bearer =
    deps.token() || (await refreshGatewayBearer(() => deps.refresh()));
  if (!bearer) return null;
  const res = await send(bearer);
  if (res.status !== 401) return res;
  const fresh = await refreshGatewayBearer(() => deps.refresh());
  // A refresh that hands back the SAME bearer the gateway just rejected is not
  // a real mint (securetoken returns the still-cached idToken when refreshed
  // twice inside one token's lifetime): replaying it earns the identical 401.
  // Treat it as signed-out (null) so callers stay quiet instead of surfacing a
  // raw expired-token error, matching the canonical `cp/fetch` twin
  // (PRODUCT-1664). A genuinely new bearer the gateway rejects still replays.
  if (fresh === bearer) return res;
  return fresh ? await send(fresh) : res;
}

/** The live-globals deps (`lib/engine.ts` owns the engine target, the session
 *  refresher and the active-space pin; the last is picked up by the defaults
 *  above, along with the build identity). Null = no gateway configured, which
 *  is every non-hosted deployment. */
export function liveGatewayDeps(): GatewayFetchDeps | null {
  const cfg = typeof window !== "undefined" ? window.__HOUSTON_ENGINE__ : null;
  if (!cfg?.baseUrl) return null;
  return {
    baseUrl: cfg.baseUrl,
    token: () => window.__HOUSTON_ENGINE__?.token || undefined,
    refresh: async () => (await window.__HOUSTON_SESSION_REFRESH__?.()) ?? null,
    fetchFn: (input, init) => fetch(input, init),
  };
}
