import type { Agent } from "../../lib/types";

/**
 * The minimal agent shape both surfaces render as an avatar chip (the global
 * page's "used by these agents" and the detail sheet's per-agent toggles).
 * Decoupled from the full `Agent` so the shared components never depend on the
 * app's larger agent model.
 */
export type AgentChip = { id: string; name: string; color?: string };

export function toAgentChip(agent: Agent): AgentChip {
  return { id: agent.id, name: agent.name, color: agent.color };
}
