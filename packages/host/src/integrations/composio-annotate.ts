import type {
  ConnectedAccount,
  Connection,
  IntegrationAppStatus,
  Toolkit,
  ToolMatch,
} from "./types";

export function activeToolkitSlugs(connections: Connection[]): string[] {
  return [
    ...new Set(
      connections.filter((c) => c.status === "active").map((c) => c.toolkit),
    ),
  ];
}

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
      ...(c.createdAt ? { createdAt: c.createdAt } : {}),
    });
    byToolkit.set(key, list);
  }
  return new Map([...byToolkit].filter(([, accounts]) => accounts.length > 1));
}

export const isConnectedIn = (slugs: string[], toolkit: string): boolean =>
  slugs.some((s) => s.toLowerCase() === toolkit.toLowerCase());

export function noAuthSlugs(catalog: Toolkit[]): Set<string> {
  return new Set(
    catalog.filter((tk) => tk.noAuth).map((tk) => tk.slug.toLowerCase()),
  );
}

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
