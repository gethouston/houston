import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  type AppDisplay,
  type ConnectionRow,
  connectionRows,
} from "../../integrations/app-display.ts";
import { splitByGrant } from "../../integrations/model.ts";

/** One connected ACCOUNT resolved for display in this agent's list. */
export interface AgentAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
  /**
   * Render the per-account label (email / alias) because this toolkit has more
   * than one account in the SAME list, so the app name alone can't tell the
   * accounts apart. A single account of an app needs no label.
   */
  showAccountLabel: boolean;
}

/**
 * Resolve connections to display rows, then flag every row that shares its
 * toolkit with another row in the SAME list so the UI labels those accounts.
 * Pure so the multi-account flag is unit-testable.
 */
function toAgentRows(rows: ConnectionRow[]): AgentAppRow[] {
  const perToolkit = new Map<string, number>();
  for (const row of rows) {
    perToolkit.set(
      row.connection.toolkit,
      (perToolkit.get(row.connection.toolkit) ?? 0) + 1,
    );
  }
  return rows.map((row) => ({
    connection: row.connection,
    app: row.app,
    showAccountLabel: (perToolkit.get(row.connection.toolkit) ?? 0) > 1,
  }));
}

/**
 * The per-agent integrations surface has exactly two shapes, kept as a
 * discriminated union so the tab can never mix them:
 *
 *  - `grants`   — the host supports per-agent grants (C4). The grant unit is the
 *                 connected ACCOUNT (`connectionId`), not the toolkit, so a user
 *                 can hand this agent one login of an app and withhold another.
 *                 `activeRows` are the accounts this agent may act on;
 *                 `accountRows` are accounts connected to the user's account but
 *                 not yet granted here, each activated with a one-click grant-add
 *                 (the promoted "Ready to activate" group). Only ACTIVE
 *                 connections are activatable — a pending or errored connection
 *                 is not a usable account to hand this agent.
 *                 `disallowedRows` are connected apps the agent's Teams allowlist
 *                 ceiling forbids (visible, non-connectable, for transparency);
 *                 empty unless a Teams host serves a restrictive allowlist.
 *  - `degraded` — grants resolved to `null` (host has no grant routes, e.g.
 *                 single-player). There is no per-agent permission, so every
 *                 connected app is usable by this agent; the list shows them all
 *                 with no activation toggles and no account section.
 */
export type AgentIntegrationsView =
  | {
      mode: "grants";
      activeRows: AgentAppRow[];
      accountRows: AgentAppRow[];
      disallowedRows: AgentAppRow[];
      grantedToolkits: Set<string>;
    }
  | { mode: "degraded"; rows: AgentAppRow[] };

/**
 * Build the agent view from the raw connections, catalog, this agent's grant
 * set (`null` = unsupported host → degraded), and the Teams effective allowlist
 * (`allowlist`: `null`/absent = unrestricted, so no app is disallowed). A
 * connected toolkit outside the allowlist is split into `disallowedRows` and
 * never appears as active/activatable — the manager restricted it (the gateway
 * also prunes such grants server-side, so this is defence in depth, not the
 * enforcer). Pure so the mode split and row derivation are unit-testable
 * without React.
 */
export function agentIntegrationsView(opts: {
  connections: IntegrationConnection[];
  catalog: IntegrationToolkit[];
  grants: string[] | null;
  allowlist?: string[] | null;
}): AgentIntegrationsView {
  if (opts.grants === null) {
    return {
      mode: "degraded",
      rows: toAgentRows(connectionRows(opts.connections, opts.catalog)),
    };
  }
  const grantSet = new Set(opts.grants);
  const allowed = opts.allowlist == null ? null : new Set(opts.allowlist);
  const allowedConns: IntegrationConnection[] = [];
  const disallowedConns: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    (allowed === null || allowed.has(c.toolkit)
      ? allowedConns
      : disallowedConns
    ).push(c);
  }
  const { granted, available } = splitByGrant({
    connections: allowedConns,
    grants: grantSet,
  });
  // The distinct toolkits behind the granted ACCOUNTS — the app-level view of
  // what this agent can act on (catalog auto-grant + ConnectMoreApps behavior).
  const grantedToolkits = new Set(granted.map((c) => c.toolkit));
  return {
    mode: "grants",
    activeRows: toAgentRows(connectionRows(granted, opts.catalog)),
    accountRows: toAgentRows(
      connectionRows(
        available.filter((c) => c.status === "active"),
        opts.catalog,
      ),
    ),
    disallowedRows: toAgentRows(connectionRows(disallowedConns, opts.catalog)),
    grantedToolkits,
  };
}

/**
 * The effective integration allowlist for an agent: the agent-level ceiling
 * intersected with the org-wide ceiling, where `null` on either side means
 * "unrestricted" (the whole catalog). Returns `null` when BOTH are unrestricted
 * (nothing to filter); otherwise the concrete set of allowed toolkit slugs
 * (possibly empty = none allowed). Mirrors the gateway's intersection so the UI
 * previews exactly what the server will enforce. Pure + unit-tested.
 */
export function effectiveAllowlist(settings: {
  allowedToolkits: string[] | null;
  orgAllowedToolkits: string[] | null;
}): string[] | null {
  const agent = settings.allowedToolkits;
  const org = settings.orgAllowedToolkits;
  if (agent === null && org === null) return null;
  if (agent === null) return org;
  if (org === null) return agent;
  const orgSet = new Set(org);
  return agent.filter((slug) => orgSet.has(slug));
}
