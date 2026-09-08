import { config } from "../config";
import { assistantTools } from "./assistant-family";
import { fileToolGuardOptions } from "./coordinator-policy";
import {
  customIntegrationTools,
  hostReachable,
  integrationTools,
  missionTools,
  saveLearningTool,
  saveRoutineTool,
  skillDirectoryTools,
} from "./host-tools";
import { personalAssistant } from "./runtime-role";
import { withToolCallLog } from "./tool-call-log";
import { buildToolSelection } from "./tool-selection";
import { makeAskUserTool } from "./tools/ask-user";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makePlanReadyTool } from "./tools/plan-ready";
import { makeRunCodeTool } from "./tools/run-code";
import { makeScrubbedBashTool } from "./tools/scrubbed-bash";
import { makeSuggestActionsTool } from "./tools/suggest-actions";
import { makeSuggestReusableTool } from "./tools/suggest-reusable";

/**
 * THE TOOL SURFACE of this long-lived runtime, decided once at module load.
 *
 * Every gate a tool rides lives here — the role this process was given, whether
 * its host is reachable, what the deployment allows — so the pi backend and the
 * Claude backend are handed the SAME answer instead of each re-deriving it (a
 * divergence there is an agent that can do something on one provider and not on
 * another). `conversation-cache.ts` builds the backends from what this exports;
 * nothing here knows about sessions or turns.
 */

/** How much of the filesystem this runtime's role has any business touching. */
const filePolicy = {
  role: config.assistantRole,
  workspaceDir: config.workspaceDir,
  sharedSkillsDir: config.sharedSkillsDir,
};

/**
 * The wall this runtime's file tools are built with (security Gate #1): extra
 * writable roots for an ordinary agent, an exact-file allowlist — its memory
 * document and nothing else — for the coordinator (coordinator-policy.ts).
 *
 * Exported so the Claude backend, which enforces file rules in its permission
 * gate rather than in these tools, is handed the SAME object instead of a
 * re-derivation that can lose half the policy on the way.
 */
export const fileToolGuard = fileToolGuardOptions(filePolicy);

// Workspace-clamped file tools. These shadow pi's builtins by name: pi's
// defaults resolve absolute paths as-is, so without the clamp a prompt-injected
// agent could read /etc/passwd or its own auth.json with no bash tool. See
// tools/clamped-fs.ts.
const fileTools = makeClampedFileTools(config.workspaceDir, fileToolGuard);

// The blocking-question tool: available in EVERY mode (holds no credential,
// makes no network call). Records the turn's pending question so it rides the
// terminal `done` frame and Houston renders it as a card in place of the input.
const askUserTool = makeAskUserTool();

// The plan-presentation tool: registered always, name-gated to Plan mode by
// `toolNamesForMode` (harmless in execute/auto — pi only exposes it when its
// name is in the mode's allowlist). Records the turn's plan-ready step so it
// rides the terminal `done` frame as a plan-approval card.
const planReadyTool = makePlanReadyTool();

// The reusable-suggestion tool: registered always, reaches execute/auto via the
// tool-selection allowlist and is filtered out of plan by name (`toolNamesForMode`).
// Records the turn's suggest-reusable step so a clean finish can ride the terminal
// `done` frame as a dismissible save-as-Skill/Routine card, rendered above the
// composer rather than replacing it.
const suggestReusableTool = makeSuggestReusableTool();

// The follow-up-actions tool: registered always, same reach as
// `suggest_reusable` (execute/auto via the tool-selection allowlist, filtered
// out of plan by `toolNamesForMode`). The product prompt MANDATES calling it on
// every turn that ends WITHOUT a blocking ask, so it must be registered on
// EVERY backend — pi (here, the default for every non-Anthropic provider) and
// Claude (backends/claude/custom-tools.ts). A name in the allowlist with no
// registered tool object is invisible to the model: pi exposes the intersection
// of the two. See conversation-cache-tools.test.ts, which pins that parity.
const suggestActionsTool = makeSuggestActionsTool();

export const toolSelection = buildToolSelection({
  codeExecution: config.codeExecution,
  integrations: integrationTools.length > 0,
  saveRoutine: hostReachable,
  saveLearning: hostReachable,
  missions: hostReachable,
  skillDirectory: hostReachable,
  assistant: assistantTools.length > 0,
  personalAssistant,
});
// The bash tool, with the child's environment scrubbed to a non-secret
// allowlist (tools/scrubbed-bash.ts). Registered as a custom tool so it SHADOWS
// pi's built-in bash by name: pi's own bash copies `process.env` into the
// child, which would hand a model-directed shell this runtime's sandbox token —
// the credential its host trades for the user's real provider tokens.
const bashTool = toolSelection.toolNames.includes("bash")
  ? makeScrubbedBashTool(config.workspaceDir)
  : null;
const runCodeTool = toolSelection.includeRunCode
  ? makeRunCodeTool({
      baseUrl: config.codeSandboxUrl,
      token: config.codeSandboxToken,
      workspaceDir: config.workspaceDir,
      limits: {
        maxConcurrent: config.runCodeMaxConcurrent,
        maxPerMinute: config.runCodePerMinute,
      },
      idToken: makeIdTokenProvider(config.codeSandboxUrl),
    })
  : null;

/**
 * The custom tool OBJECTS the pi backend registers. pi exposes the INTERSECTION
 * of this list and {@link toolSelection}'s names, so a name allowlisted with no
 * object here is invisible to the model, silently (pinned by
 * conversation-cache-tools.test.ts).
 *
 * Every one of them is wrapped in the tool-call log (session/tool-call-log.ts),
 * at the list rather than at each factory, so a tool added here cannot ship
 * unlogged. The Claude backend wraps the same tools at its MCP bridge.
 */
export const piCustomTools = [
  ...fileTools,
  askUserTool,
  planReadyTool,
  suggestReusableTool,
  suggestActionsTool,
  ...(bashTool ? [bashTool] : []),
  ...(runCodeTool ? [runCodeTool] : []),
  ...(saveRoutineTool ? [saveRoutineTool] : []),
  ...(saveLearningTool ? [saveLearningTool] : []),
  ...missionTools,
  ...skillDirectoryTools,
  ...assistantTools,
  ...integrationTools,
  ...customIntegrationTools,
].map(withToolCallLog);
