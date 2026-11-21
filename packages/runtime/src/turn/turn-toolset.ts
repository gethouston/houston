import type { PiBackendDeps } from "../backends/pi/backend";
import { withNextStepSuggestionTools } from "../session/next-step-suggestions";
import {
  buildToolSelection,
  type CodeExecutionMode,
  type ToolSelection,
} from "../session/tool-selection";
import { makeAskUserTool } from "../session/tools/ask-user";
import { BROWSER_TOOL_NAME } from "../session/tools/browser/name";
import { makeBrowserTool } from "../session/tools/browser/tool";
import { credentialTools } from "../session/tools/credential-tools";
import { makeIntegrationTools } from "../session/tools/integrations";
import { makePlanReadyTool } from "../session/tools/plan-ready";
import { makeRequestHandsOnTool } from "../session/tools/request-hands-on";
import { makeRequestProviderConnectionTool } from "../session/tools/request-provider-connection";
import { makeSaveLearningTool } from "../session/tools/save-learning";
import { makeSaveRoutineTool } from "../session/tools/save-routine";
import { makeSuggestActionsTool } from "../session/tools/suggest-actions";
import { makeSuggestReusableTool } from "../session/tools/suggest-reusable";
import type { ArchiveLoader } from "./turn-archive-fetch";
import {
  buildTurnCoordinatorTools,
  turnAssistantOptions,
} from "./turn-coordinator-tools";
import { turnHandoffBudget, turnTokenExpiry } from "./turn-deadline";
import type { TurnSessionRequest } from "./turn-session";

function capabilities(turn: TurnSessionRequest) {
  const scopes = new Set(turn.grant?.scopes ?? []);
  const callable = turn.sandbox !== undefined;
  return {
    providerConnections:
      callable && (scopes.has("integrations") || scopes.has("agent-writes")),
    integrations: callable && scopes.has("integrations"),
    agentWrites: callable && scopes.has("agent-writes"),
    codeRun: callable && scopes.has("code-run"),
  };
}

export function turnCodeExecution(
  turn: TurnSessionRequest,
  codeExecution: CodeExecutionMode,
): CodeExecutionMode {
  if (codeExecution !== "remote") return codeExecution;
  return capabilities(turn).codeRun ? "remote" : "disabled";
}

export function buildTurnToolSelection(
  turn: TurnSessionRequest,
  codeExecution: CodeExecutionMode,
): ToolSelection {
  const enabled = capabilities(turn);
  const coordinator = turnAssistantOptions(turn) !== undefined;
  return buildToolSelection({
    codeExecution: turnCodeExecution(turn, codeExecution),
    integrations: enabled.integrations && turn.role !== "coordinator",
    providerConnections: enabled.providerConnections,
    saveRoutine: enabled.agentWrites,
    saveLearning: enabled.agentWrites,
    missions: coordinator,
    assistant: coordinator,
    personalAssistant: turn.role === "coordinator",
  });
}

export function buildTurnHostTools(
  turn: TurnSessionRequest,
): PiBackendDeps["customTools"] {
  if (!turn.sandbox) return [];
  const enabled = capabilities(turn);
  const personalAssistant = turn.role === "coordinator";
  return [
    ...(enabled.providerConnections || turnAssistantOptions(turn)
      ? [
          makeRequestProviderConnectionTool(),
          makeRequestHandsOnTool({ personalAssistant }),
        ]
      : []),
    ...(enabled.integrations && !personalAssistant
      ? [
          ...makeIntegrationTools({ call: turn.sandbox.call }),
          ...credentialTools({
            personalAssistant: false,
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

export function buildTurnCommonTools(
  turn: TurnSessionRequest,
  codeSandbox: PiBackendDeps["customTools"][number] | null,
  dataDir: string,
  loadArchive?: ArchiveLoader,
): PiBackendDeps["customTools"] {
  return withNextStepSuggestionTools(
    [
      makeAskUserTool(),
      makePlanReadyTool(),
      makeSuggestReusableTool(),
      makeSuggestActionsTool(),
      ...(codeSandbox ? [codeSandbox] : []),
      ...buildTurnHostTools(turn),
      ...buildTurnCoordinatorTools(turn, dataDir, loadArchive),
    ],
    turn.nextStepSuggestions,
  );
}

export function buildTurnBrowserTool(
  selection: ToolSelection,
  workspaceDir: string,
  liveView: boolean,
  tokenExpiresAt: number | undefined,
  now: () => number = Date.now,
): PiBackendDeps["customTools"] {
  if (!selection.toolNames.includes(BROWSER_TOOL_NAME)) return [];
  const expiresAt = tokenExpiresAt ?? turnTokenExpiry(undefined, now());
  return [
    makeBrowserTool({
      workspaceDir,
      liveView,
      handoffBudget: turnHandoffBudget(expiresAt, now),
    }),
  ];
}
