// Sign-out lifecycle: tear the current identity down completely, on every
// surface. Split out of auth.ts (the sign-IN dispatcher) because it owns a
// different concern — ordering guarantees and failure surfacing — and because
// getting that ordering wrong is what shipped the "signed back in after a
// relaunch" / "can't log in again until I quit" pair of bugs.

import { cancelAllConnectFlows } from "../stores/connect-flow";
import { analytics } from "./analytics";
import { emitAuthError } from "./auth-error-bus";
import { purgeAccountLocalState } from "./houston-local-state";
import { clearSession, stopProactiveRefresh } from "./identity";
import { cancelPendingAuthorize } from "./identity/desktop-oauth";
import { resetForIdentityChange } from "./identity-reset";
import { logger } from "./logger";
import { osIsTauri } from "./os-bridge";
import { clearPersistedLocalData } from "./query-persist";
import { cacheSession, forgetActiveIdentity } from "./session-cache";
import { signOutFailure } from "./sign-out-failure";

// Lazy-load the web SDK surface (a no-op stub on desktop; never reached there).
const loadWebIdentity = () => import("@houston/web-identity");

/**
 * Sign out: stop refresh + clear the persisted (desktop) / SDK (web) session,
 * then wipe local per-user data, reset analytics, and drop the in-memory world.
 *
 * Local cleanup ALWAYS completes — every step that can reject is contained, so
 * a keychain fault can never skip `resetForIdentityChange()` / `cacheSession(null)`
 * and leave the outgoing account's cache alive for the next sign-in.
 *
 * Neither cleanup failure is swallowed, and they are reported DISTINCTLY
 * (`sign-out-failure.ts`): a surviving persisted session means "you may still be
 * signed in next launch" (`errors:auth.signOutIncomplete`), a surviving local
 * cache means only "some lists may look stale" (`errors:auth.localDataIncomplete`).
 * Either way the code goes out on the auth-error bus, which the sign-in screen
 * mounting behind this sign-out renders, and is rethrown typed.
 */
export async function signOut(): Promise<void> {
  // Before the session goes: a connect poll survives navigation by design, but
  // surviving sign-out would mean it keeps calling the gateway as (and toasting
  // at) a user who has left.
  cancelAllConnectFlows();
  // A pending loopback authorize would hold its native port for the rest of the
  // run (so the next sign-in burns another candidate port, and after four there
  // are none left) and could still land a callback for the account being left.
  // Benign null, and a no-op when nothing is pending.
  cancelPendingAuthorize("signing out");

  let sessionClearFailure: unknown;
  let localDataFailure: unknown;
  try {
    if (osIsTauri()) {
      stopProactiveRefresh();
      await clearSession();
    } else {
      const web = await loadWebIdentity();
      await web.webSignOut();
    }
  } catch (e) {
    sessionClearFailure = e;
    logger.error(
      `[auth] sign-out could not clear the stored session; it may survive this quit: ${e}`,
    );
  }
  try {
    // Wipe locally persisted per-user data so nothing lingers after sign-out
    // (HOU-712). Contained: an IndexedDB rejection must not skip the in-memory
    // reset below, or the outgoing account's world rides into the next sign-in.
    await clearPersistedLocalData();
    // And the account-scoped `houston.*` localStorage mirrors — prefs, layouts,
    // read cursors, onboarding + last-sign-in hints (PRODUCT-1235). Device-level
    // keys (host connection, standalone local data) survive; see
    // `houston-local-state.ts`.
    purgeAccountLocalState(window.localStorage);
  } catch (e) {
    localDataFailure = e;
    logger.error(`[auth] sign-out could not wipe persisted local data: ${e}`);
  }
  analytics.track("user_signed_out");
  analytics.reset();
  // Drop the outgoing identity's in-memory world — query cache, zustand stores,
  // active-org pin — so the next account never inherits it (HOU-903). Done here
  // rather than relying on cacheSession's guard because the session-store clear
  // above already nulled the session query cache, so the guard would compare
  // null → null and miss the sign-out. `forgetActiveIdentity()` keeps the
  // `cacheSession(null)` below a no-op (no double reset).
  resetForIdentityChange();
  forgetActiveIdentity();
  cacheSession(null);

  const failure = signOutFailure(sessionClearFailure, localDataFailure);
  if (failure) {
    emitAuthError(failure.code);
    throw failure;
  }
}
