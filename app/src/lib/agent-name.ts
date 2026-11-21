import {
  AGENT_NAME_MAX_LENGTH,
  isReservedAgentName,
  sameAgentName,
  takesReservedAgentName,
  validateAgentName,
} from "@houston/sdk/agent-name";

export { AGENT_NAME_MAX_LENGTH };

export type AgentNameIssue = "invalidChars" | "tooLong" | "reserved" | "taken";

export function agentNameIssue(
  raw: string,
  existingNames: string[],
  currentName?: string,
): AgentNameIssue | null {
  const v = validateAgentName(raw);
  if (!v.ok) {
    if (v.reason === "empty") return null;
    return v.reason === "too_long" ? "tooLong" : "invalidChars";
  }
  if (takesReservedAgentName(v.name, currentName)) return "reserved";
  return existingNames.some((n) => sameAgentName(n, v.name)) ? "taken" : null;
}

export function uniqueAgentName(
  base: string,
  taken: readonly string[],
): string {
  const clean = base.trim();
  const free = (candidate: string) =>
    !isReservedAgentName(candidate) &&
    !taken.some((name) => sameAgentName(name, candidate));
  if (free(clean)) return clean;
  const numbered = (suffix: number) => {
    const tail = ` ${suffix}`;
    const head = truncateCodePoints(clean, AGENT_NAME_MAX_LENGTH - tail.length);
    return `${head.trimEnd()}${tail}`;
  };
  let suffix = 2;
  while (!free(numbered(suffix))) suffix += 1;
  return numbered(suffix);
}

export function truncateCodePoints(text: string, maxUnits: number): string {
  let head = "";
  for (const codePoint of text) {
    if (head.length + codePoint.length > maxUnits) break;
    head += codePoint;
  }
  return head;
}
