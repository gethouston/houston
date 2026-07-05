import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { AgentChip } from "../integrations/agent-chip";

/**
 * Pure, DOM-free derivations for the global Integrations page. Kept separate so
 * the "which agents use which app" arithmetic is unit-tested in isolation.
 */

/**
 * Invert the per-agent grant map into `toolkit -> agentIds that have it active`.
 * A `null` grant set means the host does not support grants for that agent and
 * contributes nothing (the surface renders "all agents" globally instead).
 * Agent-id order is preserved from the map's iteration order.
 */
export function toolkitAgentIds(
  byAgent: ReadonlyMap<string, string[] | null>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [agentId, grants] of byAgent) {
    if (!grants) continue;
    for (const toolkit of grants) {
      const existing = map.get(toolkit);
      if (existing) existing.push(agentId);
      else map.set(toolkit, [agentId]);
    }
  }
  return map;
}

/**
 * Resolve agent ids to chips through a lookup, preserving id order and dropping
 * ids with no matching chip (an agent that left the workspace).
 */
export function agentChipsFor(
  ids: readonly string[],
  byId: ReadonlyMap<string, AgentChip>,
): AgentChip[] {
  const chips: AgentChip[] = [];
  for (const id of ids) {
    const chip = byId.get(id);
    if (chip) chips.push(chip);
  }
  return chips;
}

/**
 * Split connections into the two rows the page renders differently:
 *  - `active`     — usable apps, opened into the detail sheet for per-agent
 *                   activation and disconnect.
 *  - `recovering` — pending or errored connections, shown with the recovery
 *                   callout (finish / reconnect / remove) instead.
 * Input order is preserved within each bucket.
 */
export interface ConnectionBuckets {
  active: IntegrationConnection[];
  recovering: IntegrationConnection[];
}

export function partitionConnections(
  connections: IntegrationConnection[],
): ConnectionBuckets {
  const active: IntegrationConnection[] = [];
  const recovering: IntegrationConnection[] = [];
  for (const connection of connections) {
    (connection.status === "active" ? active : recovering).push(connection);
  }
  return { active, recovering };
}
