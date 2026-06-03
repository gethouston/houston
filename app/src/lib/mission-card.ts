import type { AgentMode } from "./types";

export function missionCardTags({
  agent,
  agentModes,
  routineId,
  routineLabel,
}: {
  agent?: string | null;
  agentModes?: Pick<AgentMode, "id" | "name">[];
  routineId?: string | null;
  routineLabel: string;
}): string[] | undefined {
  const mode = agentModes?.find((candidate) => candidate.id === agent);
  if (mode) return [mode.name];
  if (routineId) return [routineLabel];
  return undefined;
}
