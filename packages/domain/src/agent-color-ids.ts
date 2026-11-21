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

export type AgentColorId = (typeof AGENT_COLOR_IDS)[number];
