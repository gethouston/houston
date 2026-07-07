import type { GrantAccount } from "./grant-store";
import type { IntegrationProvider } from "./provider";
import type { IntegrationRegistry } from "./registry";
import type { ConnectedAccountInfo } from "./types";

/** Attach each account's live `accountLabel` from a connectionId → label map;
 *  an account no longer present upstream keeps its id/toolkit but has no label. */
function labelAccounts(
  accounts: GrantAccount[],
  labels: Map<string, string | undefined>,
): ConnectedAccountInfo[] {
  return accounts.map((a) => {
    const label = labels.get(a.connectionId);
    return {
      toolkit: a.toolkit,
      connectionId: a.connectionId,
      ...(label ? { accountLabel: label } : {}),
    };
  });
}

/**
 * Turn a set of granted accounts (connectionId + toolkit only) into
 * `ConnectedAccountInfo`s carrying each account's live `accountLabel`, looked up
 * from one provider's current connections.
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
  return labelAccounts(accounts, labels);
}

/**
 * The same enrichment, but the label lookup spans EVERY wired provider — the
 * granted set can mix accounts from different providers (composio connections +
 * custom integrations), and each account's label lives with whichever provider
 * owns it. Connection ids are unique across providers, so a single merged map is
 * unambiguous; each account is emitted exactly once regardless of provider count.
 */
export async function enrichAccountsAcrossRegistry(
  registry: IntegrationRegistry,
  userId: string,
  accounts: GrantAccount[],
): Promise<ConnectedAccountInfo[]> {
  const labels = new Map<string, string | undefined>();
  for (const id of registry.ids()) {
    for (const c of await registry.get(id).listConnections(userId)) {
      labels.set(c.connectionId, c.accountLabel);
    }
  }
  return labelAccounts(accounts, labels);
}
