// The full client side of account deletion (HOU-991): server purge, then a
// deeper-than-sign-out local teardown. Sign-out alone deliberately leaves
// device-local traces (the `~/.houston` tree, `houston.*` localStorage keys
// like sidebar layout / read cursors / migration outcome) so a returning user
// finds their world intact — a deleted account must leave none of that behind.

import { analytics } from "./analytics";
import { emitAuthError } from "./auth-error-bus";
import { purgeHoustonLocalState } from "./houston-local-state";
import { deleteHostedAccount } from "./identity/delete-account";
import { logger } from "./logger";
import { osIsTauri, osWipeLocalData } from "./os-bridge";
import { signOut } from "./sign-out";

/**
 * Delete the hosted account, then tear this device down.
 *
 * Throws before any teardown if the server refused (nothing was deleted, the
 * dialog stays up and shows why). After the 204 the teardown ALWAYS runs to
 * the end: each step is contained so a local failure can never strand the app
 * signed in against an account that no longer exists. A failed local wipe
 * surfaces as `local_data_clear_failed` on the auth-error bus — the sign-in
 * screen mounting behind this flow renders it (the settings toaster is
 * already unmounting, so a toast here would vanish).
 */
export async function deleteAccountAndSignOut(): Promise<void> {
  await deleteHostedAccount();

  // Before signOut()'s analytics.reset() drops the identity.
  analytics.track("account_deleted");

  let localWipeFailed = false;
  if (osIsTauri()) {
    try {
      await osWipeLocalData();
    } catch (e) {
      localWipeFailed = true;
      logger.error(
        `[account] local data wipe failed after account deletion: ${e}`,
      );
    }
  }
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
  if (localWipeFailed) emitAuthError("local_data_clear_failed");
}
