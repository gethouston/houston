import { AGENT_COLORS, type AgentColorId } from "@houston-ai/core";

export const AGENT_COLOR_SPREAD = [
  "navy",
  "rose",
  "golden",
  "forest",
  "purple",
  "orange",
  "teal",
  "crimson",
  "umber",
  "charcoal",
] as const satisfies readonly AgentColorId[];

export function nextFreeAgentColor(
  takenColors: readonly (string | undefined)[],
): AgentColorId {
  const worn = new Map<AgentColorId, number>();
  for (const stored of takenColors) {
    const entry = AGENT_COLORS.find(
      (c) => c.id === stored || c.light === stored || c.dark === stored,
    );
    if (entry) worn.set(entry.id, (worn.get(entry.id) ?? 0) + 1);
  }
  let best: AgentColorId = AGENT_COLOR_SPREAD[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const id of AGENT_COLOR_SPREAD) {
    const count = worn.get(id) ?? 0;
    if (count < bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}
