import type { GrantAccount } from "./grant-store";
import type { IntegrationProvider } from "./provider";
import type { ConnectedAccountInfo } from "./types";

/**
 * Turn a set of granted accounts (connectionId + toolkit only) into
 * `ConnectedAccountInfo`s carrying each account's live `accountLabel`, looked up
 * from the provider's current connections. A granted account no longer present
 * upstream keeps its id/toolkit but has no label.
 */
export async function enrichAccounts(
  provider: IntegrationProvider,
  userId: string,
  accounts: GrantAccount[],
): Promise<ConnectedAccountInfo[]> {
  const labels = new Map<string, string | undefined>();
  for (const c of await provider.listConnections(userId)) {
    labels.set(c.connectionId, c.accountLabel);
  }
  return accounts.map((a) => {
    const label = labels.get(a.connectionId);
    return {
      toolkit: a.toolkit,
      connectionId: a.connectionId,
      ...(label ? { accountLabel: label } : {}),
    };
  });
}
