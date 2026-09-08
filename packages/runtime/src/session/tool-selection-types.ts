/**
 * The inputs and the output of a tool selection: which capabilities this
 * runtime was granted, and the allowlist + code-execution decision that follow
 * from them. Kept type-only so every part of the selection (build, mode clamps,
 * coordinator clamp) can name the same shapes without importing each other.
 */

export type CodeExecutionMode = "local" | "remote" | "disabled";

export interface ToolSelectionInput {
  codeExecution: CodeExecutionMode;
  integrations: boolean;
  /**
   * Whether this runtime can reach its host with a sandbox token (the SAME
   * reachability the integration tools need, but NOT gated on a Composio key —
   * scheduled tasks work on every deployment). Adds `save_routine`, the
   * merge-safe way to persist a scheduled task instead of writing routines.json.
   * Optional: absent/false leaves the tool off (the agent falls back to nothing —
   * it must never write routines.json wholesale), on where the host is reachable.
   */
  saveRoutine?: boolean;
  /**
   * Whether this runtime can reach its host with a sandbox token — the SAME
   * reachability `saveRoutine` needs. Adds `save_learning`, the merge-safe way
   * to persist a learning (and the only path that records its provenance:
   * who taught it, which mission it came from). Absent/false leaves the tool
   * off and the agent falls back to the raw file, which records neither.
   */
  saveLearning?: boolean;
  /**
   * Whether this runtime can reach its host with a sandbox token — the SAME
   * reachability the other host-proxying tools need. Adds the mission-board
   * tools (PRODUCT-1244): `start_mission`, `list_missions`, `read_mission`,
   * `update_mission_status` — how the agent starts new missions (on its own
   * board, or on the board of an agent it names) and reviews them.
   * `read_mission` rides the same gate: reading missions without being able to
   * list them is useless.
   */
  missions?: boolean;
  /**
   * Whether this runtime can reach its host with a sandbox token — the SAME
   * reachability `saveRoutine` / `saveLearning` need. Adds `find_skills` +
   * `install_skill`, the agent's front door to the open skills directory
   * (PRODUCT-1238), so "is there a skill for X?" is answered in chat instead of
   * by sending the user to browse the Skills page. Absent/false leaves both off
   * and the agent simply has no directory to consult.
   */
  skillDirectory?: boolean;
  /**
   * Whether this runtime may perform user-facing Houston operations itself.
   * Requires host reachability (the tools proxy to `/sandbox/assistant/call`)
   * AND a loaded operation catalog, so it is decided by the caller, not here.
   * It is granted ONLY together with {@link personalAssistant}: the catalog
   * reaches the user's whole account (deleting agents, billing, team
   * membership), which is the coordinator's job on their behalf and no ordinary
   * agent's — including a third-party agent the user installed. Absent/false
   * leaves the family off and the agent can only describe what the user would
   * do in the app themselves.
   */
  assistant?: boolean;
  /**
   * True when this runtime IS the user's personal assistant. It is a
   * COORDINATOR: it operates Houston and hands work to the user's agents, and
   * never produces work itself — so the tools that could do the work are not on
   * its list at all (see {@link COORDINATOR_TOOL_NAMES}). Structural, not
   * prompt-deep: a model cannot browse, run code, or write a document with
   * tools it was never given.
   */
  personalAssistant?: boolean;
}

export interface ToolSelection {
  toolNames: string[];
  includeRunCode: boolean;
}
