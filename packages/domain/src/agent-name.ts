/**
 * The ONE agent-name rule, shared by every layer that touches a name: the
 * host's routes and workspace stores (agent names are directory names under
 * `~/.houston/workspaces/<Workspace>/`) and, via `@houston/sdk`, the surfaces
 * that validate BEFORE submitting (HOU-1166: the create dialog once dumped the
 * server's raw rejection under the name field instead of validating up front).
 */

/** Hard cap on an agent's display/folder name, in characters. */
export const AGENT_NAME_MAX_LENGTH = 64;

export type InvalidAgentNameReason = "empty" | "too_long" | "invalid";

export type AgentNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: InvalidAgentNameReason };

// Path separators and ".." would escape the workspace directory; control
// characters corrupt listings; a leading dot creates a folder the store's
// directory scan deliberately skips, i.e. an invisible agent.
// rejecting them is the point
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

/**
 * Validate a user-typed agent name. On success returns the trimmed name to
 * use; on failure the reason, for the caller to turn into its own copy
 * (i18n on the surfaces, {@link invalidAgentNameMessage} on the host).
 */
export function validateAgentName(raw: string): AgentNameValidation {
  const name = raw.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name.length > AGENT_NAME_MAX_LENGTH)
    return { ok: false, reason: "too_long" };
  if (FORBIDDEN.test(name) || name.includes("..") || name.startsWith("."))
    return { ok: false, reason: "invalid" };
  return { ok: true, name };
}

/**
 * The identity two agent names share when they would land on the same folder:
 * trimmed like {@link validateAgentName}, NFC-composed (APFS treats composed
 * and decomposed spellings as one name) and lowercased (macOS and Windows
 * folders are case-insensitive). Every uniqueness check compares this key, so
 * the host's refusal and a surface's pre-check can never disagree.
 */
export function agentNameKey(name: string): string {
  return name.trim().normalize("NFC").toLowerCase();
}

/** Whether two agent names claim the same folder (see {@link agentNameKey}). */
export function sameAgentName(a: string, b: string): boolean {
  return agentNameKey(a) === agentNameKey(b);
}

/**
 * The {@link agentNameKey} of the AI Manager's own display name. The manager
 * is Houston, so an AI Employee under that name would make "ask Houston"
 * ambiguous; variants that only contain it ("Houston Sales") stay free.
 */
export const RESERVED_AGENT_NAME_KEY = "houston";

/** Whether `name` is the AI Manager's own name, in any letter case, padding or
 *  Unicode composition (see {@link agentNameKey}). */
export function isReservedAgentName(name: string): boolean {
  return agentNameKey(name) === RESERVED_AGENT_NAME_KEY;
}

/**
 * Whether naming an agent `name` would newly take the reserved name. An agent
 * that already holds it (`currentName`, on a rename) keeps it under any
 * spelling, so re-saving an existing "Houston" is never refused; a create has
 * no current name.
 */
export function takesReservedAgentName(
  name: string,
  currentName?: string,
): boolean {
  if (!isReservedAgentName(name)) return false;
  return currentName === undefined || !sameAgentName(name, currentName);
}

/** The host's English error-body copy for a reserved name. The AI Manager
 *  reads it as its tool error, so it says what to do next. */
export const RESERVED_AGENT_NAME_MESSAGE =
  "Houston is the AI Manager's own name, so an AI Employee can't use it. Ask the user for another name.";

/** The host's English error-body copy for a rejected name. */
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
