import type { PiBackendDeps } from "../backends/pi/backend";
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

/**
 * What this turn may actually run, after the grant has its say. A worker
 * configured for `remote` still has no way to reach the sandbox without the
 * `code-run` scope — the gateway relays that route and nothing else does — so
 * the turn runs with code execution DISABLED rather than with a tool that
 * would 404 on every call. The caller also builds the system prompt from this
 * answer, so the prompt never promises an ability the allowlist withheld.
 */
export function turnCodeExecution(
  turn: TurnSessionRequest,
  codeExecution: CodeExecutionMode,
): CodeExecutionMode {
  if (codeExecution !== "remote") return codeExecution;
  return capabilities(turn).codeRun ? "remote" : "disabled";
}

/** Build the turn's name allowlist from non-secret grant scopes. */
export function buildTurnToolSelection(
  turn: TurnSessionRequest,
  codeExecution: CodeExecutionMode,
): ToolSelection {
  const enabled = capabilities(turn);
  // The clamp follows the ROLE alone, so a coordinator turn that somehow came
  // without a facade still gets the coordinator's narrow surface, not an
  // ordinary agent's shell. The family needs the facade as well.
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

/** Register only the host-proxying tool objects admitted by grant scopes. */
export function buildTurnHostTools(
  turn: TurnSessionRequest,
): PiBackendDeps["customTools"] {
  if (!turn.sandbox) return [];
  const enabled = capabilities(turn);
  const personalAssistant = turn.role === "coordinator";
  return [
    // Houston's request cards ride its own surface, whatever its grant says.
    ...(enabled.providerConnections || turnAssistantOptions(turn)
      ? [
          makeRequestProviderConnectionTool(),
          makeRequestHandsOnTool({ personalAssistant }),
        ]
      : []),
    // Houston never runs an integration; its own card and key-entry tool
    // come with the rest of its surface (turn-coordinator-tools.ts).
    ...(enabled.integrations && !personalAssistant
      ? [
          ...makeIntegrationTools({ call: turn.sandbox.call }),
          // The secure key-entry surface is `credentialTools`' call on every
          // backend, over THIS turn's sandbox.
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

/**
 * The tool objects BOTH provider branches carry, the same set a long-lived
 * runtime registers (session/session-tools.ts) minus the file and shell tools
 * the pi branch adds itself. The follow-up offers are here because the product
 * prompt orders them on every clean finish, and a name in the allowlist with
 * no object behind it is invisible to the model.
 */
export function buildTurnCommonTools(
  turn: TurnSessionRequest,
  codeSandbox: PiBackendDeps["customTools"][number] | null,
  dataDir: string,
  loadArchive?: ArchiveLoader,
): PiBackendDeps["customTools"] {
  return [
    makeAskUserTool(),
    makePlanReadyTool(),
    makeSuggestReusableTool(),
    ...(turn.nextStepSuggestions !== false ? [makeSuggestActionsTool()] : []),
    ...(codeSandbox ? [codeSandbox] : []),
    ...buildTurnHostTools(turn),
    ...buildTurnCoordinatorTools(turn, dataDir, loadArchive),
  ];
}

/**
 * The `browser` tool for this turn's workspace, when the selection admits it
 * (never a coordinator). Built per turn because the workspace is; the browser
 * process itself is shared across turns. `liveView` is the turn grant's
 * `browser-live` scope: `handoff` is offered only when the gateway will carry
 * the person's live view to this worker. A hand-off ends before the turn's
 * host token does (turn-deadline.ts); with no expiry known, the TTL from now.
 */
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
