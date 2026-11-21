import { coordinatorToolNames } from "./tool-selection-coordinator";
import type {
  CodeExecutionMode,
  ToolSelection,
  ToolSelectionInput,
} from "./tool-selection-types";
import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { ASSISTANT_TOOL_NAMES } from "./tools/assistant";
import { BROWSER_TOOL_NAME } from "./tools/browser/name";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import { CUSTOM_INTEGRATION_TOOL_NAMES } from "./tools/custom-integrations";
import {
  INTEGRATION_TOOL_NAMES,
  REQUEST_CONNECTION_TOOL_NAME,
} from "./tools/integrations";
import {
  LIST_AGENTS_TOOL_NAME,
  LIST_MISSIONS_TOOL_NAME,
  READ_AGENT_TOOL_NAME,
  START_MISSION_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./tools/mission-tool-names";
import { READ_MISSION_TOOL_NAME } from "./tools/read-mission";
import { REQUEST_CREDENTIAL_TOOL_NAME } from "./tools/request-credential";
import { REQUEST_HANDS_ON_TOOL_NAME } from "./tools/request-hands-on";
import { REQUEST_PROVIDER_CONNECTION_TOOL_NAME } from "./tools/request-provider-connection";
import { SAVE_LEARNING_TOOL_NAME } from "./tools/save-learning";
import { SAVE_ROUTINE_TOOL_NAME } from "./tools/save-routine";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

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
    ASK_USER_TOOL_NAME,
    SUGGEST_REUSABLE_TOOL_NAME,
    SUGGEST_ACTIONS_TOOL_NAME,
    ...(input.saveRoutine ? [SAVE_ROUTINE_TOOL_NAME] : []),
    ...(input.saveLearning ? [SAVE_LEARNING_TOOL_NAME] : []),
    ...(input.missions
      ? [
          START_MISSION_TOOL_NAME,
          LIST_MISSIONS_TOOL_NAME,
          READ_MISSION_TOOL_NAME,
          UPDATE_MISSION_STATUS_TOOL_NAME,
          ...(input.personalAssistant
            ? []
            : [LIST_AGENTS_TOOL_NAME, READ_AGENT_TOOL_NAME]),
        ]
      : []),
    ...(input.assistant && input.personalAssistant
      ? [...ASSISTANT_TOOL_NAMES]
      : []),
    ...(input.providerConnections ||
    input.integrations ||
    (input.assistant && input.personalAssistant)
      ? [REQUEST_PROVIDER_CONNECTION_TOOL_NAME, REQUEST_HANDS_ON_TOOL_NAME]
      : []),
    ...(input.assistant && input.personalAssistant && !input.integrations
      ? [REQUEST_CONNECTION_TOOL_NAME, REQUEST_CREDENTIAL_TOOL_NAME]
      : []),
    ...executable,
    BROWSER_TOOL_NAME,
    ...(input.integrations
      ? [...INTEGRATION_TOOL_NAMES, ...CUSTOM_INTEGRATION_TOOL_NAMES]
      : []),
  ];
  return {
    toolNames: input.personalAssistant
      ? coordinatorToolNames(toolNames).filter(
          (name) => input.assistant || name !== REQUEST_CREDENTIAL_TOOL_NAME,
        )
      : toolNames,
    includeRunCode:
      input.codeExecution === "remote" && !input.personalAssistant,
  };
}
