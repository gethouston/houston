import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { AgentChip } from "../integrations/agent-chip";

/**
 * Pure, DOM-free derivations for the global Integrations page. Kept separate so
 * the "which agents use which account" arithmetic is unit-tested in isolation.
 */

/**
 * Invert the per-agent grant map into `connectionId -> agentIds that have it
 * active`. The grant unit is the connected ACCOUNT (its connection id), not the
 * toolkit — one app can have several accounts, each granted independently. A
 * `null` grant set means the host does not support grants for that agent and
 * contributes nothing (the surface renders "all agents" globally instead).
 * Agent-id order is preserved from the map's iteration order.
 */
export function accountAgentIds(
  byAgent: ReadonlyMap<string, string[] | null>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [agentId, grants] of byAgent) {
    if (!grants) continue;
    for (const connectionId of grants) {
      const existing = map.get(connectionId);
      if (existing) existing.push(agentId);
      else map.set(connectionId, [agentId]);
    }
  }
  return map;
}

/**
 * The ordered, de-duplicated union of the agent ids granted across a set of
 * accounts — used for an app card whose chips show every agent that can use ANY
 * of the app's connected accounts. First-seen order (by account, then by agent
 * within an account) is preserved.
 */
export function unionAgentIds(
  connectionIds: readonly string[],
  byConnection: ReadonlyMap<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const connectionId of connectionIds) {
    for (const agentId of byConnection.get(connectionId) ?? []) {
      if (seen.has(agentId)) continue;
      seen.add(agentId);
      out.push(agentId);
    }
  }
  return out;
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
 *  - `active`     — usable accounts, grouped per app into the card grid for
 *                   per-agent activation, rename, disconnect, and adding more.
 *  - `recovering` — pending or errored connections, shown PER ACCOUNT with the
 *                   recovery callout (finish / reconnect / remove) instead.
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
