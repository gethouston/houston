/**
 * The shared 401 → `session/tokenExpired` notifier.
 *
 * When an engine request fails with HTTP 401 the host must be told to refresh
 * the token. That signal is the SDK event `session/tokenExpired`. It must fire
 * **exactly once per token value**: a reconnect storm on a stale token (the
 * agents `/v1/events` loop retries every 1.5s) would otherwise spam the host
 * into a refresh loop, yet a 401 on a *newly* set token must fire again.
 *
 * The dedupe keys on **the token the failing request actually carried**, not on
 * whatever token happens to be current when the 401 lands. That distinction is
 * load-bearing: the host proactively refreshes, so `setToken(B)` can run while
 * requests stamped with the old token A are still in flight. Attributing A's
 * late 401 to the fresh token B would re-refresh a perfectly good token — the
 * exact storm this module exists to prevent. The token identity is threaded in
 * by {@link createAuthFetch} (`modules/session/auth-fetch.ts`), the one place
 * that knows which token it stamped on each request; it reports 401s here via
 * {@link AuthExpiryNotifier.notifyExpired}.
 *
 * The kernel owns a single instance and threads it via {@link ModuleContext}, so
 * every module shares one dedupe. {@link AuthExpiryNotifier.setToken} keeps the
 * notifier's sense of the *current* token in sync (the session module calls it
 * on construction, hydrate, and every `setToken`), which is what a reported
 * request-token is compared against to spot a stale, already-rotated 401.
 */

import { EngineError } from "@houston/runtime-client";
import type { ScopeStore } from "./store";

/** The SDK event emitted once per token value when a request is rejected 401. */
export const TOKEN_EXPIRED_EVENT = "session/tokenExpired";

/**
 * Whether `err` is an engine 401. Matches the runtime-client {@link EngineError}
 * and duck-types a `{ status: 401 }` shape so an error that crossed a bridge
 * boundary (and lost its prototype) still classifies.
 */
export function isUnauthorized(err: unknown): boolean {
  if (err instanceof EngineError) return err.status === 401;
  if (typeof err === "object" && err !== null) {
    return (err as { status?: unknown }).status === 401;
  }
  return false;
}

/** Classifies engine 401s and emits `session/tokenExpired`, deduped by token value. */
export interface AuthExpiryNotifier {
  /**
   * Update the token the once-per-value dedupe and staleness check key on. The
   * session module calls this on construction, hydrate, and every `setToken`, so
   * a fresh token re-arms the signal and a stale request's 401 can be spotted.
   */
  setToken(token: string | null): void;
  /**
   * Report a 401 for a request that carried `tokenUsed` (the token stamped on
   * that request, or `null` if it went out tokenless). Emits `tokenExpired` iff
   * the 401 is attributable to the *current* token and has not already fired for
   * that value; a stale (`tokenUsed !== current`) or tokenless 401 is suppressed.
   * Passing no argument (a caller that lacks the request's token identity) is
   * suppressed — {@link createAuthFetch} is the authoritative reporter.
   */
  notifyExpired(tokenUsed?: string | null): void;
}

/**
 * Build the notifier bound to `store`. Dedupe state is per instance, i.e. per
 * SDK — one shared notifier across all modules.
 */
export function createAuthExpiryNotifier(
  store: ScopeStore,
): AuthExpiryNotifier {
  let token: string | null = null;
  let firedForToken: string | null = null;
  let hasFired = false;

  return {
    setToken(next: string | null): void {
      token = next;
    },
    notifyExpired(tokenUsed?: string | null): void {
      // No token identity: the caller can't attribute the 401 to a specific
      // token, so we can't safely emit (a stale in-flight 401 would storm the
      // host after a rotation). auth-fetch, which knows the request's token, is
      // the authoritative reporter.
      if (tokenUsed === undefined) return;
      // The request carried no token — nothing was ever sent to expire.
      if (tokenUsed === null) return;
      // The request's token is no longer current: a rotation already happened
      // while it was in flight, and the fresh token is fine. Suppress.
      if (tokenUsed !== token) return;
      // Genuine expiry of the current token: emit once per token value.
      if (hasFired && firedForToken === tokenUsed) return;
      hasFired = true;
      firedForToken = tokenUsed;
      store.emitEvent({ type: TOKEN_EXPIRED_EVENT });
    },
  };
}
