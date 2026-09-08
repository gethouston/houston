import { coordinatorToolNames } from "./tool-selection-coordinator";
import type {
  CodeExecutionMode,
  ToolSelection,
  ToolSelectionInput,
} from "./tool-selection-types";
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
import { READ_MISSION_TOOL_NAME } from "./tools/read-mission";
import { SAVE_LEARNING_TOOL_NAME } from "./tools/save-learning";
import { SAVE_ROUTINE_TOOL_NAME } from "./tools/save-routine";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

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

/**
 * pi requires a name allowlist for both built-in and custom tools. Keep that
 * decision pure so managed pods can prove code execution is disabled without
 * spinning up a live model session.
 */
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
    // The coordinator gate is structural, not a second opinion about the same
    // fact: whatever a deployment puts in an ordinary agent's environment, only
    // the runtime the HOST named coordinator can act on the user's account.
    ...(input.assistant && input.personalAssistant
      ? [...ASSISTANT_TOOL_NAMES]
      : []),
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
