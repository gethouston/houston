// The full client side of account deletion (HOU-991): server purge, then a
// slightly-deeper-than-sign-out local teardown. On top of `signOut()` this
// also purges `houston.*` localStorage keys (sidebar layout, read cursors,
// migration outcome) that plain sign-out deliberately keeps for a returning
// user. The on-disk `~/.houston` tree is left alone ON PURPOSE: those are the
// user's local files (deliberate product decision — deletion removes the
// hosted account and data, never the user's machine-local files).

import { analytics } from "./analytics";
import { purgeHoustonLocalState } from "./houston-local-state";
import { deleteHostedAccount } from "./identity/delete-account";
import { logger } from "./logger";
import { signOut } from "./sign-out";

/**
 * Delete the hosted account, then tear this device's app state down.
 *
 * Throws before any teardown if the server refused (nothing was deleted, the
 * dialog stays up and shows why). After the 204 the teardown ALWAYS runs to
 * the end: each step is contained so a local failure can never strand the app
 * signed in against an account that no longer exists.
 */
export async function deleteAccountAndSignOut(): Promise<void> {
  await deleteHostedAccount();

  // Before signOut()'s analytics.reset() drops the identity.
  analytics.track("account_deleted");

  try {
    purgeHoustonLocalState(window.localStorage);
  } catch (e) {
    // Storage may be unavailable (private mode); the account itself is gone,
    // so log and keep going rather than blocking the sign-out below.
    logger.error(`[account] localStorage purge failed: ${e}`);
  }

  // Full sign-out lifecycle: session storage, persisted caches, in-memory
  // world. Its failures surface on the auth-error bus and rethrow — let them.
  await signOut();
}
