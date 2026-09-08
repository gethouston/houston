import type { TurnMode } from "@houston/protocol";
import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { ASSISTANT_TOOL_NAMES } from "./tools/assistant";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import { CUSTOM_INTEGRATION_TOOL_NAMES } from "./tools/custom-integrations";
import { SKILL_DIRECTORY_TOOL_NAMES } from "./tools/find-skills";
import { INTEGRATION_TOOL_NAMES } from "./tools/integrations";
import {
  LIST_MISSIONS_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./tools/mission-tool-names";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { READ_MISSION_TOOL_NAME } from "./tools/read-mission";
import { SAVE_LEARNING_TOOL_NAME } from "./tools/save-learning";
import { SAVE_ROUTINE_TOOL_NAME } from "./tools/save-routine";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

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
   * Whether this runtime may perform user-facing Houston operations itself —
   * the personal-assistant pod. Requires the gateway credential, host
   * reachability (the tools proxy to `/sandbox/assistant/call`) AND a loaded
   * operation catalog, so it is decided by the caller, not here. Adds `houston_capabilities`, `houston_describe`,
   * `houston_call`; absent/false leaves all three off and the agent can only
   * describe what the user would do in the app themselves.
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

/**
 * The personal assistant's whole tool surface. Everything here either operates
 * Houston, records the turn's interaction lifecycle, or hands work to an agent.
 *
 * `read` + `write` are the ONE file pair it keeps, and only because memory
 * consolidation needs exactly them: a full memory is answered with "read that
 * file, merge it, write the trimmed list back" (routes/learning-write.ts), and
 * both halves are clamped to its own directory by the workspace guard. No
 * `edit`/`ls`/`grep`/`find` — none of them is on that path. No `bash`,
 * `run_code`, integration or skill tools: those DO work, and work belongs on an
 * agent's board where the user can see it.
 */
export const COORDINATOR_TOOL_NAMES: readonly string[] = [
  "read",
  "write",
  ASK_USER_TOOL_NAME,
  SUGGEST_REUSABLE_TOOL_NAME,
  SUGGEST_ACTIONS_TOOL_NAME,
  PLAN_READY_TOOL_NAME,
  SAVE_LEARNING_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  LIST_MISSIONS_TOOL_NAME,
  READ_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
  ...ASSISTANT_TOOL_NAMES,
];

/** Clamp any tool list to the coordinator surface, preserving order. */
export function coordinatorToolNames(all: readonly string[]): string[] {
  return all.filter((name) => COORDINATOR_TOOL_NAMES.includes(name));
}

export interface ToolSelection {
  toolNames: string[];
  includeRunCode: boolean;
}

/**
 * pi requires a name allowlist for both built-in and custom tools. Keep that
 * decision pure so managed pods can prove code execution is disabled without
 * spinning up a live model session.
 */
/**
 * The read-only tool subset a "plan" turn is clamped to: the clamped-fs READ
 * tools (`read, ls, grep, find` — never `edit`/`write`) plus `ask_user` (holds
 * no credential, takes no real-world action). Everything that mutates or acts is
 * dropped: `edit, write, bash, run_code`, and ALL integration tools
 * (`integration_search`, `integration_execute`, `request_connection` — an
 * integration call is a real-world action against the user's connected apps).
 */
export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  "read",
  "ls",
  "grep",
  "find",
  ASK_USER_TOOL_NAME,
];

/**
 * Clamp an execute-mode tool allowlist to the plan-mode read-only subset: keep
 * only the names in {@link PLAN_MODE_TOOL_NAMES}, preserving their order. Applied
 * to whatever `buildToolSelection` produced, so plan mode composes with every
 * code-execution / integration selection (a `bash`/`run_code`/`integration_*`
 * name is simply filtered out).
 */
export function planToolNames(all: readonly string[]): string[] {
  return all.filter((name) => PLAN_MODE_TOOL_NAMES.includes(name));
}

/**
 * The blocking/interactive tools Autopilot ("auto") mode drops: `ask_user`
 * (holds the turn open on a question) — auto never waits on the user's
 * judgment. EVERYTHING else an execute turn had — the clamped-fs read AND
 * write tools, `bash` / `run_code`, and the acting integration tools
 * (`integration_search`, `integration_execute`) — stays: auto acts, it just
 * never blocks on a question only the user can answer.
 *
 * `request_connection` and `request_credential` deliberately SURVIVE auto
 * (HOU-853): a missing app connection — like an API key — is the one thing
 * autonomy cannot produce. Without them an auto run that hits an unconnected
 * app is a dead end by construction: the search results say "call
 * request_connection" while the mode has removed it, so the agent can only
 * tell the user to go connect the app by hand. Recording the step doesn't
 * hold the turn open; it ends the turn with the connect/key-entry card, and
 * the live connection (or saved key) AUTO-CONTINUES the autopilot run.
 */
export const AUTO_MODE_EXCLUDED_TOOL_NAMES: readonly string[] = [
  ASK_USER_TOOL_NAME,
];

/**
 * Clamp an execute-mode tool allowlist to the Autopilot subset: drop exactly the
 * blocking tools in {@link AUTO_MODE_EXCLUDED_TOOL_NAMES}, keep everything else
 * in its original order. The inverse of plan (which keeps only read-only tools) —
 * auto keeps every acting tool and only removes the ways to wait on the user.
 */
export function autoToolNames(all: readonly string[]): string[] {
  return all.filter((name) => !AUTO_MODE_EXCLUDED_TOOL_NAMES.includes(name));
}

/**
 * The one place a turn's mode picks its tool allowlist: "plan" clamps to the
 * read-only subset PLUS the plan-only `plan_ready` tool, "auto" drops the
 * blocking tools, and "execute" (or an absent mode) passes the full allowlist
 * through unchanged. Both backends dispatch through here so the pi and Claude
 * paths never drift on what a mode allows.
 *
 * Strip-then-reinject: `plan_ready` is a plan-mode-only tool that must never
 * survive into execute/auto, yet the incoming `all` set (e.g. the Claude
 * backend's built list) may include it. So it is filtered out unconditionally
 * first, then re-added ONLY on the plan branch. This keeps `plan_ready` out of
 * the execute base allowlist regardless of how `all` was assembled.
 */
export function toolNamesForMode(
  mode: TurnMode | undefined,
  all: readonly string[],
): string[] {
  const base = all.filter((name) => name !== PLAN_READY_TOOL_NAME);
  switch (mode) {
    case "plan":
      return [...planToolNames(base), PLAN_READY_TOOL_NAME];
    case "auto":
      return autoToolNames(base);
    default:
      return [...base];
  }
}

/**
 * The exec mode a stateless (turn-mode) worker may actually run. `local` is
 * only honored on a SINGLE-USE worker: that pod serves one claimed turn and is
 * recycled, so it is single-tenant for its whole life — the standing pod's
 * justification for in-container bash, restored. On a shared multi-turn worker
 * `local` degrades to `disabled`: one org's process tree, tmp residue, and env
 * must never be readable by the next org's turn.
 */
export function turnCodeExecutionMode(
  configured: CodeExecutionMode,
  singleUse: boolean,
): CodeExecutionMode {
  if (configured === "remote") return "remote";
  if (configured === "local" && singleUse) return "local";
  return "disabled";
}

export function buildToolSelection(input: ToolSelectionInput): ToolSelection {
  const executable =
    input.codeExecution === "local"
      ? ["bash"]
      : input.codeExecution === "remote"
        ? ["run_code"]
        : [];
  const toolNames = [
    ...CLAMPED_FILE_TOOL_NAMES,
    // ask_user is available in EVERY mode/backend — any blocking question,
    // choice, or approval goes through it instead of plain-text.
    ASK_USER_TOOL_NAME,
    // suggest_reusable is available in execute AND auto — it holds no
    // credential, takes no real-world action, and never blocks the turn (a
    // clean finish offering to save the work as a Skill/Routine). It must
    // NEVER reach plan mode, and it won't automatically: PLAN_MODE_TOOL_NAMES
    // (the plan allowlist) doesn't list it, so `planToolNames` filters it out;
    // and it isn't in AUTO_MODE_EXCLUDED_TOOL_NAMES, so auto keeps it.
    SUGGEST_REUSABLE_TOOL_NAME,
    SUGGEST_ACTIONS_TOOL_NAME,
    // save_routine reaches execute AND auto (it never blocks the turn) but not
    // plan (plan is read-only): PLAN_MODE_TOOL_NAMES omits it so planToolNames
    // filters it out, and it isn't in AUTO_MODE_EXCLUDED_TOOL_NAMES so auto
    // keeps it — the same reach as suggest_reusable.
    ...(input.saveRoutine ? [SAVE_ROUTINE_TOOL_NAME] : []),
    // save_learning has the SAME reach as save_routine — execute and auto,
    // never plan (plan is read-only and saving a learning is a real write).
    // PLAN_MODE_TOOL_NAMES omits it so planToolNames filters it out, and it
    // isn't in AUTO_MODE_EXCLUDED_TOOL_NAMES so auto keeps it.
    ...(input.saveLearning ? [SAVE_LEARNING_TOOL_NAME] : []),
    // The mission-board tools share save_routine's reach: execute AND auto
    // (an orchestrating turn is usually execute; an autopilot run may still
    // check or start missions), never plan — PLAN_MODE_TOOL_NAMES omits them
    // so planToolNames filters them out, and none are in
    // AUTO_MODE_EXCLUDED_TOOL_NAMES so auto keeps them.
    ...(input.missions
      ? [
          START_MISSION_TOOL_NAME,
          LIST_MISSIONS_TOOL_NAME,
          READ_MISSION_TOOL_NAME,
          UPDATE_MISSION_STATUS_TOOL_NAME,
        ]
      : []),
    // find_skills + install_skill reach execute AND auto, never plan. Finding
    // is a read, but installing is a real write, and the pair is only useful
    // together — a plan turn that can find a skill it cannot add would just
    // dead-end. PLAN_MODE_TOOL_NAMES omits both so planToolNames filters them
    // out; neither is in AUTO_MODE_EXCLUDED_TOOL_NAMES so auto keeps them.
    ...(input.skillDirectory ? [...SKILL_DIRECTORY_TOOL_NAMES] : []),
    // The assistant family shares save_routine's reach: execute AND auto,
    // never plan. Searching the catalog is a read, but the family exists to
    // ACT on the user's account (`houston_call`), and a plan turn that could
    // list operations it cannot perform would just dead-end.
    // PLAN_MODE_TOOL_NAMES omits all three so planToolNames filters them out;
    // none is in AUTO_MODE_EXCLUDED_TOOL_NAMES so auto keeps them.
    ...(input.assistant ? [...ASSISTANT_TOOL_NAMES] : []),
    ...executable,
    ...(input.integrations
      ? [...INTEGRATION_TOOL_NAMES, ...CUSTOM_INTEGRATION_TOOL_NAMES]
      : []),
  ];
  return {
    toolNames: input.personalAssistant
      ? coordinatorToolNames(toolNames)
      : toolNames,
    // The coordinator never runs code, whatever the deployment offers.
    includeRunCode:
      input.codeExecution === "remote" && !input.personalAssistant,
  };
}
