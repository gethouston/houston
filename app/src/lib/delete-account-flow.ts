import { analytics } from "./analytics";
import { purgeHoustonLocalState } from "./houston-local-state";
import { deleteHostedAccount } from "./identity/delete-account";
import { logger } from "./logger";
import { signOut } from "./sign-out";

export async function deleteAccountAndSignOut(): Promise<void> {
  await deleteHostedAccount();

  analytics.track("account_deleted");

  try {
    purgeHoustonLocalState(window.localStorage);
  } catch (e) {
    logger.error(`[account] localStorage purge failed: ${e}`);
  }

  await signOut();
}
