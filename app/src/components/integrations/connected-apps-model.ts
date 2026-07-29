import type { IntegrationConnection } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free derivations for the connected-apps read-model both catalog
 * surfaces share (the global Integrations page and the per-agent tab). Kept
 * separate so the connection arithmetic is unit-tested in isolation.
 */

/**
 * A connection key that is stable per ACCOUNT, not per app: a toolkit can hold
 * several accounts at once (e.g. an active login beside a leftover pending one),
 * so the connected-apps surfaces key by connection id and fall back to the
 * toolkit only when the host has not assigned an id yet.
 */
export function connKey(c: { connectionId: string; toolkit: string }): string {
  return c.connectionId || c.toolkit;
}

/** A connection that never reached `active` — the app is not usable yet. */
export type BrokenStatus = Exclude<IntegrationConnection["status"], "active">;

/** One app's broken connection: the status its catalog row wears, and the
 *  connection its dialog's Remove disconnects. */
export interface BrokenConnection {
  connection: IntegrationConnection;
  status: BrokenStatus;
}

/**
 * The two homes a connection can have on a catalog surface:
 *  - `installed` — WORKING connections, the Installed strip's rows (and the
 *    only apps the browse catalog leaves out);
 *  - `broken`    — apps whose connection is pending or errored, by toolkit.
 *    They stay in the catalog, in their own category rows, wearing their
 *    status: a broken connection lives where the app lives, never in a
 *    separate recovery pile at the top of the pane.
 */
export interface ConnectionBuckets {
  installed: IntegrationConnection[];
  broken: ReadonlyMap<string, BrokenConnection>;
}

/**
 * Split connections into those two buckets, preserving input order. A toolkit
 * that holds BOTH an active connection and a leftover broken one counts as
 * installed only — one home per app, so the working login wins and the leftover
 * never re-materializes as a second Slack in the catalog. Of several broken
 * connections to one toolkit the first wins (they say the same thing, and the
 * row shows one status).
 */
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

/**
 * One installed APP: its primary connection plus every active account behind
 * it. A toolkit can hold several accounts at once (two Gmail logins, HOU-901) —
 * the surfaces render ONE row per app and list the accounts in the detail
 * dialog, never two identical Gmail rows.
 */
export interface InstalledApp {
  /** The primary (first) active connection — single-account surfaces read it. */
  connection: IntegrationConnection;
  /** Every ACTIVE connection for the toolkit, primary first (length >= 1). */
  accounts: IntegrationConnection[];
}

/**
 * Group a list of ACTIVE connections into one entry per toolkit, preserving
 * first-seen order. Callers feed it `partitionConnections(...).installed` (or
 * any already-active subset); it never filters by status itself.
 */
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

/**
 * The toolkits the browse catalog must NOT offer, because they already have a
 * home elsewhere on the surface: a WORKING connection is an Installed strip
 * row, and a connection the agent's Teams ceiling forbids is a "Not allowed"
 * row. A pending or errored connection inside the ceiling is deliberately
 * absent from this set — it stays in the catalog, in its own category section,
 * where its `+` retries the connect.
 *
 * `allowlist === null` (single player, or Teams with no ceiling) blocks
 * nothing, so the set is the working connections alone.
 */
export function catalogHiddenToolkits(
  connections: IntegrationConnection[],
  allowlist: string[] | null = null,
): Set<string> {
  const allowed = allowlist === null ? null : new Set(allowlist);
  const hidden = new Set<string>();
  for (const c of connections) {
    if (
      c.status === "active" ||
      (allowed !== null && !allowed.has(c.toolkit))
    ) {
      hidden.add(c.toolkit);
    }
  }
  return hidden;
}
