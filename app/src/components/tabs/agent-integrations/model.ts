import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  type AppDisplay,
  connectionRows,
} from "../../integrations/app-display.ts";
import { effectiveAccess } from "../../integrations/effective-access.ts";

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
 *                 serves a restrictive allowlist. `availableRows` are apps
 *                 connected on the account but NOT yet granted to this agent
 *                 (only `active` ones — pending/errored are recovered from the
 *                 global page): they surface with an inline "turn on for this
 *                 agent" toggle instead of hiding, so a connected app is never
 *                 invisible here. Beyond that the tab is a connect surface
 *                 (connect with auto-grant, recover a pending connection,
 *                 disconnect).
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
      availableRows: AgentAppRow[];
    }
  | { mode: "degraded"; rows: AgentAppRow[] };

/**
 * Build the agent view from the raw connections, catalog, this agent's grant
 * set (`null` = unsupported host → degraded), and the Teams effective allowlist
 * (`allowlist`: `null`/absent = unrestricted, so no app is disallowed). A
 * connected toolkit outside the allowlist is split into `disallowedRows` and
 * never appears as active — the manager restricted it (the gateway also prunes
 * such grants server-side, so this is defence in depth, not the enforcer).
 * Every connection is classified through the one {@link effectiveAccess}
 * resolver — usable → `activeRows`, admin-blocked → `disallowedRows`,
 * connected-but-ungranted (and `active`) → `availableRows` (the inline
 * turn-on section). Pure so the mode split and row derivation are unit-testable
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
      rows: connectionRows(opts.connections, opts.catalog),
    };
  }
  const allowlist = opts.allowlist ?? null;
  const usable: IntegrationConnection[] = [];
  const disallowed: IntegrationConnection[] = [];
  const available: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    const access = effectiveAccess({
      toolkit: c.toolkit,
      connections: opts.connections,
      grants: opts.grants,
      allowlist,
    });
    switch (access.state) {
      case "usable":
        usable.push(c);
        break;
      case "blockedByAdmin":
        disallowed.push(c);
        break;
      case "notGrantedToAgent":
        // Only surface an activatable app the user can act on right now; a
        // pending/errored ungranted connection is recovered from the global
        // Integrations page, not turned on for an agent mid-OAuth.
        if (c.status === "active") available.push(c);
        break;
      // `notConnected` is unreachable here — we iterate real connections.
    }
  }
  return {
    mode: "grants",
    activeRows: connectionRows(usable, opts.catalog),
    disallowedRows: connectionRows(disallowed, opts.catalog),
    availableRows: connectionRows(available, opts.catalog),
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
