import type { Agent } from "./types";

/**
 * Keep an existing selection only when it still belongs to the loaded agent
 * list. Otherwise pick the first available agent so the shell never renders the
 * no-agent empty state for a workspace that already has agents.
 */
export function selectCurrentAgent(
  agents: Agent[],
  current: Agent | null,
): Agent | null {
  if (agents.length === 0) return null;
  if (!current) return agents[0];
  return agents.find((a) => a.id === current.id) ?? agents[0];
}

export function shouldApplyAgentLoad(
  generation: number,
  latestGeneration: number,
): boolean {
  return generation === latestGeneration;
}

export function selectLoadedAgent(
  agents: Agent[],
  current: Agent | null,
  selectionBeforeLoad: string | undefined,
): Agent | null {
  if (current?.id !== selectionBeforeLoad) {
    return agents.find((agent) => agent.id === current?.id) ?? current ?? null;
  }
  return selectCurrentAgent(agents, current);
}
