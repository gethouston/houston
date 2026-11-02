/**
 * Houston's backend-neutral reasoning levels. pi 1.4.0 also supports "max";
 * backends/pi/thinking-level.ts translates this normalized "xhigh" to "max"
 * for models such as Terra that serve max instead of xhigh.
 */
export type PiThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * The effort applied to a reasoning-capable model when the user has chosen none.
 * pi enables a model's reasoning ONLY when a thinking level is set (it sends
 * `enable_thinking = !!reasoningEffort`), so without this a "thinking" model
 * (e.g. an OpenCode model with a reasoning toggle but no effort levels) would
 * silently run with reasoning OFF. "medium" matches the picker's default; pi
 * clamps it to whatever the model actually supports.
 */
export const DEFAULT_REASONING_EFFORT = "medium";

/**
 * Map a Houston effort value to pi's `thinkingLevel`.
 *
 * Houston's effort vocabulary (agent config + routine pin) is
 * `low | medium | high | xhigh | max`. Normalize "max" to the backend-neutral
 * "xhigh" here. pi 1.4.0 supports both; backends/pi/thinking-level.ts selects
 * the spelling the resolved model serves, including Terra's "max".
 *
 * Returns `undefined` for an absent or unrecognized value so the caller OMITS
 * the override entirely and pi falls back to its own default — never a silent
 * substitution of a level the user didn't ask for.
 */
export function toThinkingLevel(
  effort: string | null | undefined,
): PiThinkingLevel | undefined {
  switch (effort) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    // Normalize here; the pi backend restores "max" when the model requires it.
    case "max":
      return "xhigh";
    default:
      return undefined;
  }
}
