import { AGENT_COLORS, type AgentColorId } from "@houston-ai/core";

/**
 * The color a new AI Employee gets when nobody picked one: the first palette
 * color no teammate wears yet, so a fresh hire stands apart in the rail. Once
 * every color is taken, the least worn one (earliest in wheel order on a tie).
 */
export function nextFreeAgentColor(
  takenColors: readonly (string | undefined)[],
): AgentColorId {
  const worn = new Map<AgentColorId, number>();
  for (const stored of takenColors) {
    // A color outside the palette (a legacy custom hex) wears no swatch.
    const entry = AGENT_COLORS.find(
      (c) => c.id === stored || c.light === stored || c.dark === stored,
    );
    if (entry) worn.set(entry.id, (worn.get(entry.id) ?? 0) + 1);
  }
  let best = AGENT_COLORS[0].id;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const { id } of AGENT_COLORS) {
    const count = worn.get(id) ?? 0;
    if (count < bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}
