import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  type AppDisplay,
  connectionRows,
} from "../../integrations/app-display.ts";
import { catalogHiddenToolkits } from "../../integrations/connected-apps-model.ts";
import { effectiveAccess } from "../../integrations/effective-access.ts";

/** One connected app resolved for display in this agent's list. */
export interface AgentAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

/**
 * The per-agent integrations surface, now a pure CONNECT surface. Usability is
 * connection ∩ effective allowlist — the per-agent GRANTS layer is gone
 * (permissions live in one place, the Permissions view):
 *
 *  - `activeRows`     — apps this agent can use (connected AND inside the Teams
 *                       allowlist). The strip keeps the WORKING ones; a pending
 *                       or errored connection is filtered out downstream and
 *                       stays in the catalog, on the app's own row.
 *  - `disallowedRows` — connected apps the agent's Teams allowlist ceiling
 *                       forbids (visible, non-connectable, for transparency),
 *                       empty unless a Teams host serves a restrictive allowlist.
 */
export interface AgentIntegrationsView {
  activeRows: AgentAppRow[];
  disallowedRows: AgentAppRow[];
}

/**
 * Build the agent view from the raw connections, catalog, and the Teams
 * effective allowlist (`allowlist`: `null`/absent = unrestricted, so no app is
 * disallowed). A connected toolkit outside the allowlist is split into
 * `disallowedRows` and never appears as active — the manager restricted it (the
 * gateway also enforces this server-side, so this is defence in depth, not the
 * enforcer). Every connection is classified through the one {@link
 * effectiveAccess} resolver — usable → `activeRows`, admin-blocked →
 * `disallowedRows`. Pure so the row derivation is unit-testable without React.
 */
export function agentIntegrationsView(opts: {
  connections: IntegrationConnection[];
  catalog: IntegrationToolkit[];
  allowlist?: string[] | null;
}): AgentIntegrationsView {
  const allowlist = opts.allowlist ?? null;
  const usable: IntegrationConnection[] = [];
  const disallowed: IntegrationConnection[] = [];
  for (const c of opts.connections) {
    const access = effectiveAccess({
      toolkit: c.toolkit,
      connections: opts.connections,
      allowlist,
    });
    switch (access.state) {
      case "usable":
        usable.push(c);
        break;
      case "blockedByAdmin":
        disallowed.push(c);
        break;
      // `notConnected` is unreachable here — we iterate real connections.
    }
  }
  return {
    activeRows: connectionRows(usable, opts.catalog),
    disallowedRows: connectionRows(disallowed, opts.catalog),
  };
}

/** How many apps the catalog tab can still offer: not already working (an
 *  active connection lives in the Installed strip) and, on a Teams host, inside
 *  the effective allowlist (locked rows don't count) — the tab trigger's count
 *  chip. An app whose connection is pending or errored is still browsable here,
 *  so it counts. Pure + node-tested. */
export function connectableCount(opts: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  allowlist: string[] | null;
}): number {
  const hidden = catalogHiddenToolkits(opts.connections, opts.allowlist);
  const allowed = opts.allowlist === null ? null : new Set(opts.allowlist);
  return opts.catalog.filter(
    (tk) => !hidden.has(tk.slug) && (allowed === null || allowed.has(tk.slug)),
  ).length;
}
