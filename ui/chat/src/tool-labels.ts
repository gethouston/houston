/**
 * Tool-name → human label resolution. Pure (no React imports) so the exact
 * same verb that a `ToolBlock` row shows ("Reading file", "Running command")
 * can also drive the process-block header ("Mission in progress: Reading
 * file"), and so it can be unit-tested under `node:test` without a DOM.
 *
 * These labels are intentionally English: `ui/` stays i18n-agnostic, and the
 * app does not pass `toolLabels`, so tool verbs read in English in every
 * locale (matching how the in-pane tool rows have always rendered).
 */

const ACTIVE_LABELS: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Bash: "Running command",
  Glob: "Searching files",
  Grep: "Searching code",
  WebSearch: "Searching the web",
  WebFetch: "Fetching page",
  ToolSearch: "Looking up tools",
  Agent: "Delegating task",
};

const DONE_LABELS: Record<string, string> = {
  Read: "Read file",
  Write: "Wrote file",
  Edit: "Edited file",
  Bash: "Ran command",
  Glob: "Searched files",
  Grep: "Searched code",
  WebSearch: "Searched the web",
  WebFetch: "Fetched page",
  ToolSearch: "Looked up tools",
  Agent: "Delegated task",
};

/** The bare tool name with any MCP `server__tool` prefix stripped. */
export function toolShortName(name: string): string {
  return name.includes("__") ? name.split("__").pop()! : name;
}

/**
 * Human label for a tool call. `done` picks past vs. present tense; `custom`
 * (the consumer's optional `toolLabels`) overrides by short name. Falls back to
 * the de-underscored short name for unknown tools.
 */
export function getToolActionLabel(
  name: string,
  done: boolean,
  custom?: Record<string, string>,
): string {
  const short = toolShortName(name);
  if (custom?.[short]) return custom[short];
  const map = done ? DONE_LABELS : ACTIVE_LABELS;
  return map[short] || short.replace(/_/g, " ");
}
