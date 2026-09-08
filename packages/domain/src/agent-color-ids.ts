/**
 * Houston's agent palette, by id.
 *
 * Wheel order - neutral first, then green to teal to blue to violet to pink to
 * red to orange to yellow, earth last. This IS the display order of every
 * picker, and neighbours on the wheel sitting side by side is what makes a
 * too-close pair (rose vs crimson) visible at a glance instead of shipping.
 *
 * The ids live in the domain because both sides of the product need the same
 * ten: `@houston-ai/core` pairs each with its light and dark hex from
 * `@houston/design-tokens` to paint them, and the host validates the colour an
 * assistant operation carries against them
 * (`packages/host/src/assistant/entity-values.ts`) before the value reaches a
 * team or an agent.
 */
export const AGENT_COLOR_IDS = [
  "charcoal",
  "forest",
  "teal",
  "navy",
  "purple",
  "rose",
  "crimson",
  "orange",
  "golden",
  "umber",
] as const;

/** One of the ten palette ids - the exact union a colour parameter accepts. */
export type AgentColorId = (typeof AGENT_COLOR_IDS)[number];
