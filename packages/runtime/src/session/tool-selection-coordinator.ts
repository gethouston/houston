import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { ASSISTANT_TOOL_NAMES } from "./tools/assistant";
import { REQUEST_CONNECTION_TOOL_NAME } from "./tools/integrations";
import {
  LIST_MISSIONS_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./tools/mission-tool-names";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { READ_MISSION_TOOL_NAME } from "./tools/read-mission";
import { REQUEST_CREDENTIAL_TOOL_NAME } from "./tools/request-credential";
import { REQUEST_HANDS_ON_TOOL_NAME } from "./tools/request-hands-on";
import { REQUEST_PROVIDER_CONNECTION_TOOL_NAME } from "./tools/request-provider-connection";
import { SAVE_LEARNING_TOOL_NAME } from "./tools/save-learning";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

/**
 * The personal assistant's whole tool surface. Everything here either operates
 * Houston, records the turn's interaction lifecycle, or hands work to an agent.
 *
 * `read` is the ONE file tool it keeps: the workspace guard lets it open its
 * memory document and a read-only uploads folder (coordinator-policy.ts). No
 * `write`: memory changes only through save_learning, which archives what a
 * consolidation replaces. No `edit`/`ls`/`grep`/`find` either. No `bash`,
 * `run_code`, integration execution or skill tools: those DO work, and work belongs on an
 * agent's board where the user can see it.
 */
export const COORDINATOR_TOOL_NAMES: readonly string[] = [
  "read",
  ASK_USER_TOOL_NAME,
  REQUEST_CONNECTION_TOOL_NAME,
  REQUEST_CREDENTIAL_TOOL_NAME,
  REQUEST_PROVIDER_CONNECTION_TOOL_NAME,
  REQUEST_HANDS_ON_TOOL_NAME,
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
