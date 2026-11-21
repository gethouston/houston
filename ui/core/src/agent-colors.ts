import { color as themeColor } from "@houston/design-tokens";
import {
  AGENT_COLOR_IDS,
  type AgentColorId,
} from "@houston/domain/agent-color-ids";

export { AGENT_COLOR_IDS, type AgentColorId };

export interface AgentColor {
  id: AgentColorId;
  light: string;
  dark: string;
}

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

export function agentColorId(stored: string | undefined): AgentColorId {
  const match = AGENT_COLORS.find(
    (entry) =>
      entry.id === stored || entry.light === stored || entry.dark === stored,
  );
  return match?.id ?? AGENT_COLORS[0].id;
}

export function colorValue(color: AgentColor): string {
  return `var(--ht-agent-${color.id}, ${color.light})`;
}
