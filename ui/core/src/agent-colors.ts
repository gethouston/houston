import { color as themeColor } from "@houston/design-tokens";

/** Agent color definitions, each with light and dark variants. */
export interface AgentColor {
  id: string;
  light: string;
  dark: string;
}

const AGENT_COLOR_IDS = [
  "charcoal",
  "forest",
  "navy",
  "purple",
  "crimson",
  "orange",
  "golden",
] as const;

/** Palette hexes come from @houston/design-tokens (the same source that
 *  generates the --ht-agent-* CSS variables), so TS and CSS can't drift. */
export const AGENT_COLORS: AgentColor[] = AGENT_COLOR_IDS.map((id) => ({
  id,
  light: themeColor.light[`agent-${id}`],
  dark: themeColor.dark[`agent-${id}`],
}));

export function resolveAgentColor(stored: string | undefined): string {
  if (!stored) return colorValue(AGENT_COLORS[0]);
  const entry = AGENT_COLORS.find(
    (c) => c.id === stored || c.light === stored || c.dark === stored,
  );
  if (entry) return colorValue(entry);
  return stored;
}

/**
 * Resolve a stored color value (id, light hex, or dark hex) to its canonical
 * palette id, defaulting to the first color when nothing matches. Used to mark
 * the active swatch in color pickers.
 */
export function agentColorId(stored: string | undefined): string {
  const match = AGENT_COLORS.find(
    (entry) =>
      entry.id === stored || entry.light === stored || entry.dark === stored,
  );
  return match?.id ?? AGENT_COLORS[0].id;
}

/**
 * Theme-reactive CSS color for a palette entry. References the --ht-agent-*
 * custom property (light on :root, dark on [data-theme="dark"]) so the browser
 * recolors on theme switch without any React re-render — a snapshot hex picked
 * by reading data-theme at render time goes stale the moment the theme flips.
 * Use only where CSS colors are accepted (styles), never where a literal hex
 * is required.
 */
export function colorValue(color: AgentColor): string {
  return `var(--ht-agent-${color.id}, ${color.light})`;
}
