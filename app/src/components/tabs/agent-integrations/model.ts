import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  type AppDisplay,
  connectionRows,
} from "../../integrations/app-display.ts";
import { splitByGrant } from "../../integrations/model.ts";

/** One connected app resolved for display in this agent's list. */
export interface AgentAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

/**
 * The per-agent integrations surface has exactly two shapes, kept as a
 * discriminated union so the tab can never mix them:
 *
 *  - `grants`   — the host supports per-agent grants (C4). `activeRows` are the
 *                 apps this agent can use; `disallowedRows` are connected apps
 *                 the agent's Teams allowlist ceiling forbids (visible,
 *                 non-connectable, for transparency), empty unless a Teams host
 *                 serves a restrictive allowlist. Connected-but-ungranted
 *                 account apps do NOT appear on this tab: activating an existing
 *                 connection for an agent now lives in Settings > Connected
 *                 accounts. This tab is a pure connect surface (connect with
 *                 auto-grant, recover a pending connection, disconnect).
 *  - `degraded` — grants resolved to `null` (host has no grant routes, e.g.
 *                 single-player). There is no per-agent permission, so every
 *                 connected app is usable by this agent; the list shows them all
 *                 with no activation toggles and no account section.
 */
export type AgentIntegrationsView =
  | {
      mode: "grants";
      activeRows: AgentAppRow[];
      disallowedRows: AgentAppRow[];
    }
  | { mode: "degraded"; rows: AgentAppRow[] };

/**
 * Build the agent view from the raw connections, catalog, this agent's grant
 * set (`null` = unsupported host → degraded), and the Teams effective allowlist
 * (`allowlist`: `null`/absent = unrestricted, so no app is disallowed). A
 * connected toolkit outside the allowlist is split into `disallowedRows` and
 * never appears as active — the manager restricted it (the gateway also prunes
 * such grants server-side, so this is defence in depth, not the enforcer).
 * Connected-but-ungranted apps are intentionally absent from the grants view:
 * activating an existing connection for an agent lives in Settings > Connected
 * accounts. Pure so the mode split and row derivation are unit-testable without
 * React.
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
      rows: connectionRows(opts.connections, opts.catalog),
    };
  }
  const grantedToolkits = new Set(opts.grants);
  const allowed = opts.allowlist == null ? null : new Set(opts.allowlist);
  const allowedConns: IntegrationConnection[] = [];
  const disallowedConns: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    (allowed === null || allowed.has(c.toolkit)
      ? allowedConns
      : disallowedConns
    ).push(c);
  }
  const { granted } = splitByGrant({
    connections: allowedConns,
    grants: grantedToolkits,
  });
  return {
    mode: "grants",
    activeRows: connectionRows(granted, opts.catalog),
    disallowedRows: connectionRows(disallowedConns, opts.catalog),
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

/** How many apps the catalog tab can still offer: not connected and, on a
 *  Teams host, inside the effective allowlist (locked rows don't count) — the
 *  tab trigger's count chip. Pure + node-tested. */
export function connectableCount(opts: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  allowlist: string[] | null;
}): number {
  const connected = new Set(opts.connections.map((c) => c.toolkit));
  const allowed = opts.allowlist === null ? null : new Set(opts.allowlist);
  return opts.catalog.filter(
    (tk) =>
      !connected.has(tk.slug) && (allowed === null || allowed.has(tk.slug)),
  ).length;
}
