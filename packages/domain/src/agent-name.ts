export const AGENT_NAME_MAX_LENGTH = 64;

export type InvalidAgentNameReason = "empty" | "too_long" | "invalid";

export type AgentNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: InvalidAgentNameReason };

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

export function validateAgentName(raw: string): AgentNameValidation {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name.length > AGENT_NAME_MAX_LENGTH)
    return { ok: false, reason: "too_long" };
  if (FORBIDDEN.test(name) || name.includes("..") || name.startsWith("."))
    return { ok: false, reason: "invalid" };
  return { ok: true, name };
}

export function agentNameKey(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

export function sameAgentName(a: string, b: string): boolean {
  return agentNameKey(a) === agentNameKey(b);
}

export const RESERVED_AGENT_NAME_KEY = "houston";

export function isReservedAgentName(name: string): boolean {
  return agentNameKey(name) === RESERVED_AGENT_NAME_KEY;
}

export function takesReservedAgentName(
  name: string,
  currentName?: string,
): boolean {
  if (!isReservedAgentName(name)) return false;
  return currentName === undefined || !sameAgentName(name, currentName);
}

export const RESERVED_AGENT_NAME_MESSAGE =
  "Houston is the AI Manager's own name, so an AI Employee can't use it. Ask the user for another name.";

export function invalidAgentNameMessage(
  reason: InvalidAgentNameReason,
): string {
  switch (reason) {
    case "empty":
      return "agent name must not be empty";
    case "too_long":
      return `agent name must be ${AGENT_NAME_MAX_LENGTH} characters or fewer`;
    case "invalid":
      return "agent name must not contain slashes, control characters, '..', or a leading dot";
  }
}
