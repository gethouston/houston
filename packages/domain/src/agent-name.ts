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
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
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
