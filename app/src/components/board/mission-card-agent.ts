import type { Agent } from "../../lib/types.ts";

export function missionCardAgentName(
  agentsByPath: Map<string, Agent>,
  agentPath: string,
  rowAgentName: string | undefined,
): string | undefined {
  return agentsByPath.get(agentPath)?.name ?? rowAgentName;
}

export function agentsByPath(agents: Agent[]): Map<string, Agent> {
  return new Map(agents.map((a) => [a.folderPath, a]));
}
