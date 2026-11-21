import type { ProviderOption } from "@houston/domain";
import type { TurnMode } from "@houston/protocol";
import { withNextStepSuggestionTools } from "../../session/next-step-suggestions";
import {
  COORDINATOR_TOOL_NAMES,
  toolNamesForMode,
} from "../../session/tool-selection";
import { makeAgentDirectoryTools } from "../../session/tools/agent-directory";
import { makeAskUserTool } from "../../session/tools/ask-user";
import {
  type AssistantToolOptions,
  makeAssistantTools,
} from "../../session/tools/assistant";
import {
  type BrowserToolOptions,
  makeBrowserTool,
} from "../../session/tools/browser/tool";
import { credentialTools } from "../../session/tools/credential-tools";
import {
  type IntegrationToolOptions,
  makeIntegrationTools,
  makeRequestConnectionTool,
} from "../../session/tools/integrations";
import { makeMissionTools } from "../../session/tools/missions";
import { makePlanReadyTool } from "../../session/tools/plan-ready";
import { makeReadMissionTool } from "../../session/tools/read-mission";
import { makeRequestHandsOnTool } from "../../session/tools/request-hands-on";
import { makeRequestProviderConnectionTool } from "../../session/tools/request-provider-connection";
import { makeSaveLearningTool } from "../../session/tools/save-learning";
import { makeSaveRoutineTool } from "../../session/tools/save-routine";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import { makeSuggestReusableTool } from "../../session/tools/suggest-reusable";
import type { BridgedPiTool } from "./mcp-tool-adapter";
import { makeSilentSuggestActionsTool } from "./next-step-suggestions";

export interface BridgedToolSetInput {
  integrations?: IntegrationToolOptions;
  assistant?: AssistantToolOptions;
  personalAssistant?: boolean;
  browser?: BrowserToolOptions;
  tools?: BridgedPiTool[];
  providers?: readonly ProviderOption[];
  mode?: TurnMode;
  nextStepSuggestions?: boolean;
  silentNextStepSuggestions?: boolean;
}

function integrationTools(input: BridgedToolSetInput) {
  if (input.integrations) return makeIntegrationTools(input.integrations);
  if (input.assistant) return [makeRequestConnectionTool()];
  return [];
}

export function buildBridgedToolSet(
  input: BridgedToolSetInput,
): BridgedPiTool[] {
  const built =
    input.tools ??
    ([
      makeAskUserTool(),
      makePlanReadyTool(),
      makeSuggestReusableTool(),
      makeSuggestActionsTool(),
      ...(input.integrations ? [makeSaveRoutineTool(input.integrations)] : []),
      ...(input.integrations ? [makeSaveLearningTool(input.integrations)] : []),
      ...(input.integrations
        ? [
            ...makeMissionTools({
              ...input.integrations,
              personalAssistant: input.personalAssistant ?? false,
              ...(input.providers ? { providers: input.providers } : {}),
            }),
            makeReadMissionTool({
              ...input.integrations,
              personalAssistant: input.personalAssistant ?? false,
            }),
            ...(input.personalAssistant
              ? []
              : makeAgentDirectoryTools(input.integrations)),
          ]
        : []),
      ...(input.assistant ? makeAssistantTools(input.assistant) : []),
      ...(input.integrations || input.assistant
        ? [
            makeRequestProviderConnectionTool(),
            makeRequestHandsOnTool({
              personalAssistant: input.personalAssistant ?? false,
            }),
          ]
        : []),
      ...integrationTools(input),
      ...(input.browser ? [makeBrowserTool(input.browser)] : []),
      ...credentialTools({
        personalAssistant: input.personalAssistant ?? false,
        ...(input.assistant ? { assistant: input.assistant } : {}),
        ...(input.integrations ? { integrations: input.integrations } : {}),
      }),
    ] as unknown as BridgedPiTool[]);
  const scoped = input.personalAssistant
    ? built.filter((t) => COORDINATOR_TOOL_NAMES.includes(t.name))
    : built;
  const allowed = new Set(
    toolNamesForMode(
      input.mode,
      scoped.map((t) => t.name),
    ),
  );
  const tools = withNextStepSuggestionTools(
    scoped.filter((t) => allowed.has(t.name)),
    input.nextStepSuggestions,
  );
  if (input.nextStepSuggestions === false && input.silentNextStepSuggestions)
    tools.push(makeSilentSuggestActionsTool());
  return tools;
}
