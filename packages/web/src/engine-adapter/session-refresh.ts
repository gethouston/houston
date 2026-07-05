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
 * Force-refresh the hosted session and resolve the new access token, or null
 * when there is no refresher or the refresh failed (a real sign-out — the
 * caller lets its 401 surface). Concurrent callers share one refresh; a caller
 * arriving after it settles starts a new one.
 */
export function refreshLiveToken(): Promise<string | null> {
  const refresh =
    typeof window !== "undefined"
      ? window.__HOUSTON_SESSION_REFRESH__
      : undefined;
  if (!refresh) return Promise.resolve(null);
  if (!inflight) {
    inflight = refresh()
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
