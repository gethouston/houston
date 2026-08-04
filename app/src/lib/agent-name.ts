import { validateAgentName } from "@houston/sdk/agent-name";

export { AGENT_NAME_MAX_LENGTH } from "@houston/sdk/agent-name";

/**
 * What's wrong with a typed agent name, pre-submit (HOU-1166). `null` means
 * submittable; an empty name also returns `null` because the submit buttons
 * are simply disabled for it — no error copy needed while the field is blank.
 */
export type AgentNameIssue = "invalidChars" | "tooLong" | "taken";

/**
 * Validate a name BEFORE it goes to the host: shape via the shared SDK rule,
 * duplicates against the already-loaded agent list. Case-insensitive because
 * agent folders land on case-insensitive filesystems (macOS, Windows).
 */
export function agentNameIssue(
  raw: string,
  existingNames: string[],
): AgentNameIssue | null {
  const v = validateAgentName(raw);
  if (!v.ok) {
    if (v.reason === "empty") return null;
    return v.reason === "too_long" ? "tooLong" : "invalidChars";
  }
  const lower = v.name.toLowerCase();
  return existingNames.some((n) => n.trim().toLowerCase() === lower)
    ? "taken"
    : null;
}
