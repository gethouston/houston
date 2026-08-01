// The `["session"]` cache write plus the identity-change guard in front of it.
//
// Split out of auth.ts so both the sign-in dispatcher (auth.ts) and the sign-out
// lifecycle (sign-out.ts) share ONE writer — the guard must never be bypassed by
// writing the session query directly, or the outgoing account's world leaks into
// the next sign-in (HOU-903).

import { SESSION_QUERY_KEY, type Session } from "./identity";
import { identityChanged } from "./identity-change";
import { resetForIdentityChange } from "./identity-reset";
import { queryClient } from "./query-client";

// The Firebase uid whose world the app's in-memory caches/stores currently hold.
// Tracked HERE rather than read from the session query cache because the
// session-store clear notifies `useSession` — nulling that cache — BEFORE
// `signOut()`'s `cacheSession(null)` runs, so a cache read would miss the
// outgoing uid. Seeded by `cacheSession` on sign-in/refresh; nulled by `signOut`.
let activeIdentityUid: string | null = null;

/** Write the session into the `["session"]` cache, resetting the client-side
 *  world first when the identity actually changed. */
export function cacheSession(session: Session | null): void {
  const nextUid = session?.uid ?? null;
  // A different account signing in (an account switch with no explicit
  // sign-out) must drop the outgoing identity's world before the new one loads
  // (HOU-903). Sign-out is handled directly in `signOut` (it calls
  // `forgetActiveIdentity()` first, so this stays a no-op there — no double
  // reset); a token refresh keeps the same uid, so this is a no-op then too.
  if (identityChanged(activeIdentityUid, nextUid)) {
    resetForIdentityChange();
  }
  activeIdentityUid = nextUid;
  queryClient.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
}

/**
 * Forget which identity the caches belong to WITHOUT running the guard. Sign-out
 * resets the world itself (it has to: the session-store clear already nulled the
 * session query, so the guard would compare null → null and miss it) and then
 * writes `null` through `cacheSession`, which must stay a no-op.
 */
export function forgetActiveIdentity(): void {
  activeIdentityUid = null;
}

/**
 * Session mirror for shells that own their own auth listener (web `CloudApp`
 * and its `onIdTokenChanged` stream): routes an externally-observed session
 * change through the same identity-change guard as the in-app flows, so an
 * account switch on those shells drops the outgoing account's query cache and
 * stores exactly like the desktop path does (HOU-903). Writing the session
 * query directly would skip that guard and leak the previous account's world
 * into the next sign-in.
 */
export function applyExternalSession(session: Session | null): void {
  cacheSession(session);
}
