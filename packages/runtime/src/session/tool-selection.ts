/**
 * A runtime's tool surface: which tools a session is allowed to have, and how a
 * turn's mode narrows that set. This module is the front door — the shapes live
 * in `tool-selection-types.ts`, the allowlist assembly (plus the worker's
 * code-execution policy) in `tool-selection-build.ts`, the per-mode clamps for
 * plan and Autopilot in `tool-selection-modes.ts`, and the personal assistant's
 * coordinator surface in `tool-selection-coordinator.ts`.
 */

export {
  buildToolSelection,
  turnCodeExecutionMode,
} from "./tool-selection-build";
export {
  COORDINATOR_TOOL_NAMES,
  coordinatorToolNames,
} from "./tool-selection-coordinator";
export {
  AUTO_MODE_EXCLUDED_TOOL_NAMES,
  autoToolNames,
  PLAN_MODE_TOOL_NAMES,
  planToolNames,
  toolNamesForMode,
} from "./tool-selection-modes";
export type {
  CodeExecutionMode,
  ToolSelection,
  ToolSelectionInput,
} from "./tool-selection-types";
