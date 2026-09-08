import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { ASSISTANT_TOOL_NAMES } from "./tools/assistant";
import {
  LIST_MISSIONS_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./tools/mission-tool-names";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { READ_MISSION_TOOL_NAME } from "./tools/read-mission";
import { SAVE_LEARNING_TOOL_NAME } from "./tools/save-learning";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

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
