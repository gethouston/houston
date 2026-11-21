import type { IntegrationConnection } from "@houston/engine-adapter";

export function connKey(c: { connectionId: string; toolkit: string }): string {
  return c.connectionId || c.toolkit;
}

export type BrokenStatus = Exclude<IntegrationConnection["status"], "active">;

export interface BrokenConnection {
  connection: IntegrationConnection;
  status: BrokenStatus;
}

export interface ConnectionBuckets {
  installed: IntegrationConnection[];
  broken: ReadonlyMap<string, BrokenConnection>;
}

export function partitionConnections(
  connections: IntegrationConnection[],
): ConnectionBuckets {
  const installed: IntegrationConnection[] = [];
  const working = new Set<string>();
  for (const connection of connections) {
    if (connection.status === "active") {
      installed.push(connection);
      working.add(connection.toolkit);
    }
  }
  const broken = new Map<string, BrokenConnection>();
  for (const connection of connections) {
    if (connection.status === "active") continue;
    if (working.has(connection.toolkit) || broken.has(connection.toolkit)) {
      continue;
    }
    broken.set(connection.toolkit, { connection, status: connection.status });
  }
  return { installed, broken };
}

export interface InstalledApp {
  connection: IntegrationConnection;
  accounts: IntegrationConnection[];
}

export function groupAccounts(
  connections: IntegrationConnection[],
): InstalledApp[] {
  const out: InstalledApp[] = [];
  const byToolkit = new Map<string, InstalledApp>();
  for (const connection of connections) {
    const existing = byToolkit.get(connection.toolkit);
    if (existing) {
      existing.accounts.push(connection);
      continue;
    }
    const app: InstalledApp = { connection, accounts: [connection] };
    byToolkit.set(connection.toolkit, app);
    out.push(app);
  }
  return out;
}

export function catalogHiddenToolkits(
  connections: IntegrationConnection[],
): Set<string> {
  const hidden = new Set<string>();
  for (const c of connections) {
    if (c.status === "active") hidden.add(c.toolkit);
  }
  return hidden;
}
