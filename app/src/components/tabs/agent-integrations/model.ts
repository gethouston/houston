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
 *  - `grants`   — the host supports per-agent grants (C4). Only the apps this
 *                 agent is allowed to act on are listed; the rest live behind
 *                 the picker's "Ready to activate" group.
 *  - `degraded` — grants resolved to `null` (host has no grant routes, e.g.
 *                 single-player). There is no per-agent permission, so every
 *                 connected app is usable by this agent; the list shows them all
 *                 with no activation toggles.
 */
export type AgentIntegrationsView =
  | { mode: "grants"; activeRows: AgentAppRow[]; grantedToolkits: Set<string> }
  | { mode: "degraded"; rows: AgentAppRow[] };

/**
 * Build the agent view from the raw connections, catalog, and this agent's
 * grant set (`null` = unsupported host → degraded). Pure so the mode split and
 * row derivation are unit-testable without React.
 */
export function agentIntegrationsView(opts: {
  connections: IntegrationConnection[];
  catalog: IntegrationToolkit[];
  grants: string[] | null;
}): AgentIntegrationsView {
  if (opts.grants === null) {
    return {
      mode: "degraded",
      rows: connectionRows(opts.connections, opts.catalog),
    };
  }
  const grantedToolkits = new Set(opts.grants);
  const { granted } = splitByGrant({
    connections: opts.connections,
    grants: grantedToolkits,
  });
  return {
    mode: "grants",
    activeRows: connectionRows(granted, opts.catalog),
    grantedToolkits,
  };
}
