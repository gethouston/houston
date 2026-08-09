import type {
  ConnectedAccount,
  Connection,
  IntegrationAppStatus,
  Toolkit,
  ToolMatch,
} from "./types";

/**
 * Status annotation for Composio search results: every returned entry carries
 * its IntegrationAppStatus, derived from the acting user's active connections
 * (the direct adapter cannot produce `blocked` — that ceiling lives in the
 * closed gateway — nor `unknown`, which is the empty case). Split from
 * composio-search.ts so that file holds only the discovery policy.
 */

/** Active-connection lookup for one search: which toolkit slugs are connected. */
export function activeToolkitSlugs(connections: Connection[]): string[] {
  return [
    ...new Set(
      connections.filter((c) => c.status === "active").map((c) => c.toolkit),
    ),
  ];
}

/**
 * The accounts to attach per toolkit (lowercased slug): only toolkits holding
 * MORE than one active account get an entry — a single account needs no
 * disambiguation, so the common case adds nothing to the result.
 */
export function multiAccountsByToolkit(
  connections: Connection[],
): ReadonlyMap<string, ConnectedAccount[]> {
  const byToolkit = new Map<string, ConnectedAccount[]>();
  for (const c of connections) {
    if (c.status !== "active" || !c.connectionId) continue;
    const key = c.toolkit.toLowerCase();
    const list = byToolkit.get(key) ?? [];
    list.push({
      id: c.connectionId,
      ...(c.accountLabel ? { label: c.accountLabel } : {}),
    });
    byToolkit.set(key, list);
  }
  return new Map([...byToolkit].filter(([, accounts]) => accounts.length > 1));
}

export const isConnectedIn = (slugs: string[], toolkit: string): boolean =>
  slugs.some((s) => s.toLowerCase() === toolkit.toLowerCase());

/** The catalog's no-auth toolkit slugs, lowercased: these need no connection —
 *  their tools work as-is, so search treats them as `connected` (the agent
 *  must USE them, never offer a request_connection that can only 400). */
export function noAuthSlugs(catalog: Toolkit[]): Set<string> {
  return new Set(
    catalog.filter((tk) => tk.noAuth).map((tk) => tk.slug.toLowerCase()),
  );
}

/** Stamp `connected` + `status` on a raw action match — an active connection or
 *  a no-auth toolkit (nothing to connect) both mean "usable now" — plus the
 *  account list when the toolkit holds several (so the model can target one). */
export function annotate(
  match: ToolMatch,
  connectedSlugs: string[],
  noAuth: ReadonlySet<string>,
  multiAccounts: ReadonlyMap<string, ConnectedAccount[]>,
): ToolMatch {
  const connected =
    isConnectedIn(connectedSlugs, match.toolkit) ||
    noAuth.has(match.toolkit.toLowerCase());
  const status: IntegrationAppStatus = connected ? "connected" : "connectable";
  const accounts = multiAccounts.get(match.toolkit.toLowerCase());
  return { ...match, connected, status, ...(accounts ? { accounts } : {}) };
}
