import type { Agent } from "../../../lib/types.ts";

/** A one-agent team opens immediately; larger teams preserve explicit choice. */
export function initialExpandedAgents(agents: readonly Agent[]): Set<string> {
  return new Set(agents.length === 1 && agents[0] ? [agents[0].id] : []);
}

export function toggleExpandedAgent(
  current: ReadonlySet<string>,
  agentId: string,
): Set<string> {
  const next = new Set(current);
  if (next.has(agentId)) next.delete(agentId);
  else next.add(agentId);
  return next;
}
