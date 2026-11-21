import type { WorkHistory } from "./agent-activity-summary-model.ts";

export function firstDayInviteIds<
  A extends { id: string; folderPath: string },
>(input: {
  agents: readonly A[];
  history: (agentId: string) => WorkHistory;
  canStart: (agent: A) => boolean;
  firstDay: (folderPath: string) => string | undefined;
}): Set<string> {
  const ids = new Set<string>();
  for (const agent of input.agents) {
    if (input.history(agent.id) !== "none") continue;
    if (!input.canStart(agent)) continue;
    if (input.firstDay(agent.folderPath) !== "pending") continue;
    ids.add(agent.id);
  }
  return ids;
}

export function firstDayCandidates<A extends { id: string }>(input: {
  agents: readonly A[];
  history: (agentId: string) => WorkHistory;
  canStart: (agent: A) => boolean;
}): A[] {
  return input.agents.filter(
    (agent) => input.history(agent.id) === "none" && input.canStart(agent),
  );
}
