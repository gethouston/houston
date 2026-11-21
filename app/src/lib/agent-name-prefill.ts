import {
  AGENT_NAME_MAX_LENGTH,
  validateAgentName,
} from "@houston/sdk/agent-name";
import { truncateCodePoints, uniqueAgentName } from "./agent-name.ts";

export function prefilledAgentName(
  role: string,
  taken: readonly string[],
): string {
  const base = truncateCodePoints(role.trim(), AGENT_NAME_MAX_LENGTH).trimEnd();
  if (!validateAgentName(base).ok) return "";
  return uniqueAgentName(base, taken);
}
