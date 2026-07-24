/**
 * Tool-name → human label resolution. Pure (no React imports) so the exact
 * same verb that a `ToolBlock` row shows ("Reading file", "Running command")
 * can also drive the process-block header, and so it can be unit-tested under
 * `node:test` without a DOM.
 *
 * These labels are intentionally English: `ui/` stays i18n-agnostic, and the
 * app does not pass `toolLabels`, so tool verbs read in English in every
 * locale (matching how the in-pane tool rows have always rendered).
 */

// Two dialects share these maps: the Claude tool names (PascalCase) and the
// pi coding-agent tool names (lowercase: bash/read/write/edit/grep/find/ls).
// Both run through the same engine, so both must resolve to the same verbs —
// an unmapped name leaks a raw "bash" row into the mission log (HOU-717).
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
  read: "Reading file",
  write: "Writing file",
  edit: "Editing file",
  bash: "Running command",
  find: "Searching files",
  grep: "Searching code",
  ls: "Listing files",
  // Houston product tools (MCP-prefixed on the wire, resolved by short name).
  // Plain human verbs so the mission-log ROW never leaks a raw underscored
  // name; the process-block HEADER upgrades an execute to a branded
  // "Gmail · Sending email" line when the app resolves it.
  integration_execute: "Using an app",
  integration_search: "Looking through your apps",
  ask_user: "Checking with you",
  request_connection: "Asking to connect an app",
  request_credential: "Asking for access",
  suggest_reusable: "Offering to save this",
  save_routine: "Saving a routine",
  run_code: "Running code",
  custom_integration_detect: "Inspecting a custom app",
  custom_integration_add: "Adding a custom app",
  plan_ready: "Sharing the plan",
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
  read: "Read file",
  write: "Wrote file",
  edit: "Edited file",
  bash: "Ran command",
  find: "Searched files",
  grep: "Searched code",
  ls: "Listed files",
  integration_execute: "Used an app",
  integration_search: "Looked through your apps",
  ask_user: "Checked with you",
  request_connection: "Asked to connect an app",
  request_credential: "Asked for access",
  suggest_reusable: "Offered to save this",
  save_routine: "Saved a routine",
  run_code: "Ran code",
  custom_integration_detect: "Inspected a custom app",
  custom_integration_add: "Added a custom app",
  plan_ready: "Shared the plan",
};

/** The bare tool name with any MCP `server__tool` prefix stripped. */
export function toolShortName(name: string): string {
  return name.includes("__") ? (name.split("__").at(-1) ?? name) : name;
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
