import type { Agent } from "../../lib/types.ts";

export type NewMissionTarget =
  | { kind: "direct"; agent: Agent }
  | { kind: "menu" };

export function newMissionTarget(
  pinnedAgent: Agent | null,
  scopedAgents: Agent[],
): NewMissionTarget {
  if (pinnedAgent) return { kind: "direct", agent: pinnedAgent };
  if (scopedAgents.length === 1)
    return { kind: "direct", agent: scopedAgents[0] };
  return { kind: "menu" };
}
