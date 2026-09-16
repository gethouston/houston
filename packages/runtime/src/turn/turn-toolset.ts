import type { PiBackendDeps } from "../backends/pi/backend";
import { assistantOptions } from "../session/assistant-family";
import { personalAssistant } from "../session/runtime-role";
import {
  buildToolSelection,
  type CodeExecutionMode,
  type ToolSelection,
} from "../session/tool-selection";
import { credentialTools } from "../session/tools/credential-tools";
import { makeIntegrationTools } from "../session/tools/integrations";
import { makeRequestHandsOnTool } from "../session/tools/request-hands-on";
import { makeRequestProviderConnectionTool } from "../session/tools/request-provider-connection";
import { makeSaveLearningTool } from "../session/tools/save-learning";
import { makeSaveRoutineTool } from "../session/tools/save-routine";
import type { TurnSessionRequest } from "./turn-session";

function capabilities(turn: TurnSessionRequest) {
  const scopes = new Set(turn.grant?.scopes ?? []);
  const callable = turn.sandbox !== undefined;
  return {
    providerConnections:
      callable && (scopes.has("integrations") || scopes.has("agent-writes")),
    integrations: callable && scopes.has("integrations"),
    agentWrites: callable && scopes.has("agent-writes"),
  };
}

/** Build the turn's name allowlist from non-secret grant scopes. */
export function buildTurnToolSelection(
  turn: TurnSessionRequest,
  codeExecution: CodeExecutionMode,
): ToolSelection {
  const enabled = capabilities(turn);
  return buildToolSelection({
    codeExecution,
    integrations: enabled.integrations,
    providerConnections: enabled.providerConnections,
    saveRoutine: enabled.agentWrites,
    saveLearning: enabled.agentWrites,
    missions: false,
  });
}

/** Register only the host-proxying tool objects admitted by grant scopes. */
export function buildTurnHostTools(
  turn: TurnSessionRequest,
): PiBackendDeps["customTools"] {
  if (!turn.sandbox) return [];
  const enabled = capabilities(turn);
  return [
    ...(enabled.providerConnections
      ? [
          makeRequestProviderConnectionTool(),
          makeRequestHandsOnTool({ personalAssistant }),
        ]
      : []),
    ...(enabled.integrations
      ? [
          ...makeIntegrationTools({ call: turn.sandbox.call }),
          // The secure key-entry surface is `credentialTools`' call on every
          // backend; the assistant family's catalog is process-level but its
          // transport is not, so it is rebound to THIS turn's sandbox.
          ...credentialTools({
            personalAssistant,
            ...(assistantOptions
              ? { assistant: { ...assistantOptions, call: turn.sandbox.call } }
              : {}),
            integrations: { call: turn.sandbox.call },
          }),
        ]
      : []),
    ...(enabled.agentWrites
      ? [
          makeSaveRoutineTool({ call: turn.sandbox.call }),
          makeSaveLearningTool({ call: turn.sandbox.call }),
        ]
      : []),
  ];
}
