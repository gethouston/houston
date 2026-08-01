// Classifying what a sign-out failed at.
//
// Sign-out runs two independent cleanups and they mean very different things to
// the user, so they must never collapse into one message:
//
//  * the PERSISTED SESSION (Keychain / DPAPI / browser store) surviving means
//    "you may still be signed in the next time you open Houston" — the bug that
//    had users silently logged back into an account they had left;
//  * the LOCAL DATA CACHE (IndexedDB-persisted lists) surviving means only "some
//    lists may look stale". The login is genuinely gone.
//
// Reporting the second as the first tells the user their login persisted when it
// did not, which is its own trust bug. Pure + injected, so the ordering rule is
// unit-testable without the app's stores.

import { IdentityError } from "./identity/errors.ts";

/**
 * Turn the two cleanup outcomes into the ONE typed failure to surface, or `null`
 * when the sign-out was clean.
 *
 * When both failed the session clear wins: a surviving login is strictly worse
 * than a surviving cache, and it is the one the user must act on.
 */
export function signOutFailure(
  sessionClear: unknown,
  localData: unknown,
): IdentityError | null {
  if (sessionClear !== undefined)
    return typed(sessionClear, "session_clear_failed");
  if (localData !== undefined)
    return typed(localData, "local_data_clear_failed");
  return null;
}

function typed(
  cause: unknown,
  code: "session_clear_failed" | "local_data_clear_failed",
): IdentityError {
  // An already-classified failure keeps its own code — the storage layer knows
  // more about what went wrong than this call site does.
  return cause instanceof IdentityError
    ? cause
    : new IdentityError(code, { cause });
}
