/**
 * pi's reasoning levels (a mirror of pi-ai's `ThinkingLevel`). pi's ceiling is
 * "xhigh"; it has no Houston "max". Kept as a local literal so we don't depend
 * on pi-ai's type being re-exported, while staying structurally assignable to
 * the `thinkingLevel` that `createAgentSession` / `session.setThinkingLevel`
 * accept.
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
 * `low | medium | high | xhigh | max`; pi's is `minimal | low | medium | high |
 * xhigh`. Only "max" has no direct counterpart — it denotes "the most reasoning
 * this model offers", which in pi is "xhigh", so it maps there; pi then clamps
 * "xhigh" down to whatever the resolved model actually supports.
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
    // Houston's top level; pi's ceiling is "xhigh" (it then clamps per model).
    case "max":
      return "xhigh";
    default:
      return undefined;
  }
}
