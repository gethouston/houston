import {
  AGENT_NAME_MAX_LENGTH,
  validateAgentName,
} from "@houston/sdk/agent-name";

export { AGENT_NAME_MAX_LENGTH };

/**
 * What's wrong with a typed agent name, pre-submit (HOU-1166). `null` means
 * submittable; an empty name also returns `null`: each caller decides what a
 * blank name means (the employee card's `employeeNameIssue` makes it
 * "required", the copy wizard disables its submit).
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

/** Whether two names are the same to the host: trimmed, case-insensitive. */
export function sameAgentName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * `base`, or the first of "base 2", "base 3"... nobody holds yet. Compared the
 * way the host compares names (trimmed, case-insensitive), and a numbered
 * variant shortens `base` to leave room for its suffix within
 * {@link AGENT_NAME_MAX_LENGTH}, so the variant is one the create accepts.
 */
export function uniqueAgentName(
  base: string,
  taken: readonly string[],
): string {
  const clean = base.trim();
  const free = (candidate: string) =>
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

/**
 * The longest prefix of `text` within `maxUnits` UTF-16 units (the unit the
 * host's length rule counts) that never splits a surrogate pair.
 */
function truncateCodePoints(text: string, maxUnits: number): string {
  let head = "";
  for (const codePoint of text) {
    if (head.length + codePoint.length > maxUnits) break;
    head += codePoint;
  }
  return head;
}
