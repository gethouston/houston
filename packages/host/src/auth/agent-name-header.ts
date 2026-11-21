import { validateAgentName } from "@houston/domain";
import type { Agent } from "../domain/types";

export const AGENT_NAME_HEADER = "x-houston-agent-name";

export function validDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const checked = validateAgentName(value);
  return checked.ok ? checked.name : undefined;
}

export function displayNameFromHeader(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  try {
    return validDisplayName(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}

export function withDisplayName(agent: Agent, name: string | undefined): Agent {
  return name ? { ...agent, name } : agent;
}
