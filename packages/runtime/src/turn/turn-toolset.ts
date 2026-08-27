import type { PiBackendDeps } from "../backends/pi/backend";
import {
  buildToolSelection,
  type CodeExecutionMode,
  type ToolSelection,
} from "../session/tool-selection";
import { makeCustomIntegrationTools } from "../session/tools/custom-integrations";
import { makeSkillDirectoryTools } from "../session/tools/find-skills";
import { makeIntegrationTools } from "../session/tools/integrations";
import { makeSaveLearningTool } from "../session/tools/save-learning";
import { makeSaveRoutineTool } from "../session/tools/save-routine";
import type { PiTurnRequest } from "./turn-session";

function capabilities(turn: PiTurnRequest) {
  const scopes = new Set(turn.grant?.scopes ?? []);
  const callable = turn.sandbox !== undefined;
  return {
    integrations: callable && scopes.has("integrations"),
    agentWrites: callable && scopes.has("agent-writes"),
  };
}

/** Build the turn's name allowlist from non-secret grant scopes. */
export function buildTurnToolSelection(
  turn: PiTurnRequest,
  codeExecution: CodeExecutionMode,
): ToolSelection {
  const enabled = capabilities(turn);
  return buildToolSelection({
    codeExecution,
    integrations: enabled.integrations,
    saveRoutine: enabled.agentWrites,
    saveLearning: enabled.agentWrites,
    skillDirectory: enabled.agentWrites,
    missions: false,
  });
}

/** Register only the host-proxying tool objects admitted by grant scopes. */
export function buildTurnHostTools(
  turn: PiTurnRequest,
): PiBackendDeps["customTools"] {
  if (!turn.sandbox) return [];
  const enabled = capabilities(turn);
  return [
    ...(enabled.integrations
      ? [
          ...makeIntegrationTools({ call: turn.sandbox.call }),
          ...makeCustomIntegrationTools({ call: turn.sandbox.call }),
        ]
      : []),
    ...(enabled.agentWrites
      ? [
          makeSaveRoutineTool({ call: turn.sandbox.call }),
          makeSaveLearningTool({ call: turn.sandbox.call }),
          ...makeSkillDirectoryTools({ call: turn.sandbox.call }),
        ]
      : []),
  ];
}
