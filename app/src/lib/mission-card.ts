import type { AgentMode } from "./types";

export function missionCardTags({
  agent,
  agentModes,
  routineId,
  routineLabel,
  originSessionKey,
  agentStartedLabel,
}: {
  agent?: string | null;
  agentModes?: Pick<AgentMode, "id" | "name">[];
  routineId?: string | null;
  routineLabel: string;
  /** Present when the agent started this mission itself (PRODUCT-1244). */
  originSessionKey?: string | null;
  agentStartedLabel?: string;
}): string[] | undefined {
  const mode = agentModes?.find((candidate) => candidate.id === agent);
  if (mode) return [mode.name];
  if (routineId) return [routineLabel];
  if (originSessionKey && agentStartedLabel) return [agentStartedLabel];
  return undefined;
}
