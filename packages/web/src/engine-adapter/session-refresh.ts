/**
 * The hosted-session refresh seam: when the gateway answers 401, the transport
 * asks the app layer for a freshly-minted Supabase access token and replays the
 * request, so an expired bearer never surfaces to the user (HOU-687).
 *
 * The app layer (desktop `EngineGate`, web `CloudApp`) installs the refresher on
 * `window.__HOUSTON_SESSION_REFRESH__` — the same global-injection idiom as
 * `__HOUSTON_ENGINE__` — because this adapter must not import the Supabase
 * client: auth ownership stays with the shell that configured it. No refresher
 * installed (static-token hosts, dev bearers, tests) → refresh resolves null
 * and the original 401 stands.
 *
 * The refresher's answer is three-valued, and the distinction is load-bearing
 * (HOU-1106): a token means refreshed, null means the session is terminally
 * gone (a real sign-out — the caller lets its 401 surface), and a TRANSIENT
 * failure — the identity service unreachable while a sleep-wake reconnect
 * settles — THROWS. Both installers already speak this contract: the desktop's
 * `refreshNow()` rethrows `IdentityError("network")` precisely so callers
 * retry instead of signing the user out, and the web's `getIdToken(true)`
 * throws FirebaseError `auth/network-request-failed`. Flattening that throw to
 * null (as this seam once did) turned every wake-from-sleep refresh race into
 * a bogus "invalid or expired token" red toast + Sentry report.
 */

declare global {
  interface Window {
    __HOUSTON_SESSION_REFRESH__?: () => Promise<string | null>;
  }
}

/** The one in-flight refresh — a 401 storm across N concurrent requests must
 *  collapse to a single token mint, not N racing refresh calls (Supabase
 *  rotates the refresh token on use, so racing refreshes can invalidate each
 *  other and sign the user out). */
let inflight: Promise<string | null> | null = null;

/**
 * A refresher failure that means "couldn't reach the identity service", not
 * "the session is gone": the desktop's typed `IdentityError("network")`, the
 * Firebase SDK's `auth/network-request-failed`, or a raw fetch transport
 * rejection (always a TypeError). Anything else is treated as terminal, so an
 * unexpected refresher bug still surfaces as the 401 it produced.
 */
const isTransientRefreshFailure = (err: unknown): boolean => {
  if (err instanceof TypeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === "network" || code === "auth/network-request-failed";
};

/**
 * Force-refresh the hosted session. Resolves the new access token; resolves
 * null when there is no refresher or the session is terminally gone (a real
 * sign-out — the caller lets its 401 surface); THROWS a transport-shaped
 * `TypeError` when the refresher failed transiently. The message starts with
 * "Load failed" on purpose: that is the prefix the app's connectivity
 * classifier (`isNetworkTransportError`, HOU-1085) keys on, so a refresh
 * beaten by a settling reconnect surfaces as the one deduped connectivity
 * notice — never as an auth error or a Sentry report. Concurrent callers
 * share one refresh; a caller arriving after it settles starts a new one.
 */
export function refreshLiveToken(): Promise<string | null> {
  const refresh =
    typeof window !== "undefined"
      ? window.__HOUSTON_SESSION_REFRESH__
      : undefined;
  if (!refresh) return Promise.resolve(null);
  if (!inflight) {
    inflight = refresh()
      .catch((err: unknown) => {
        if (isTransientRefreshFailure(err)) {
          throw new TypeError("Load failed (session refresh)", { cause: err });
        }
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
