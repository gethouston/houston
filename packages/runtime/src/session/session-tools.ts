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
} from "./host-tools";
import { personalAssistant } from "./runtime-role";
import { withToolCallLog } from "./tool-call-log";
import { buildToolSelection } from "./tool-selection";
import { makeAskUserTool } from "./tools/ask-user";
import { makeBrowserTool } from "./tools/browser/tool";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makePlanReadyTool } from "./tools/plan-ready";
import { makeRequestHandsOnTool } from "./tools/request-hands-on";
import { makeRequestProviderConnectionTool } from "./tools/request-provider-connection";
import { makeRunCodeTool } from "./tools/run-code";
import { RunCodeLimiter } from "./tools/run-code-limiter";
import { directRunCodeTransport } from "./tools/run-code-transport";
import { makeScrubbedBashTool } from "./tools/scrubbed-bash";
import { makeSuggestActionsTool } from "./tools/suggest-actions";
import { makeSuggestReusableTool } from "./tools/suggest-reusable";

const filePolicy = {
  role: config.assistantRole,
  workspaceDir: config.workspaceDir,
  sharedSkillsDir: config.sharedSkillsDir,
};

export const fileToolGuard = fileToolGuardOptions(filePolicy);

const fileTools = makeClampedFileTools(config.workspaceDir, fileToolGuard);

const askUserTool = makeAskUserTool();

const planReadyTool = makePlanReadyTool();

const suggestReusableTool = makeSuggestReusableTool();

const suggestActionsTool = makeSuggestActionsTool();

export const toolSelection = buildToolSelection({
  codeExecution: config.codeExecution,
  integrations: integrationTools.length > 0,
  saveRoutine: hostReachable,
  saveLearning: hostReachable,
  missions: hostReachable,
  assistant: assistantTools.length > 0,
  personalAssistant,
});
const bashTool = toolSelection.toolNames.includes("bash")
  ? makeScrubbedBashTool(config.workspaceDir)
  : null;
export const browserToolOptions = toolSelection.toolNames.includes("browser")
  ? { workspaceDir: config.workspaceDir, liveView: true }
  : undefined;
const runCodeTool = toolSelection.includeRunCode
  ? makeRunCodeTool({
      transport: directRunCodeTransport({
        baseUrl: config.codeSandboxUrl,
        token: config.codeSandboxToken,
        idToken: makeIdTokenProvider(config.codeSandboxUrl),
      }),
      workspaceDir: config.workspaceDir,
      limiter: new RunCodeLimiter({
        maxConcurrent: config.runCodeMaxConcurrent,
        maxPerMinute: config.runCodePerMinute,
      }),
    })
  : null;

export const piCustomTools = [
  ...fileTools,
  askUserTool,
  planReadyTool,
  suggestReusableTool,
  suggestActionsTool,
  ...(bashTool ? [bashTool] : []),
  ...(browserToolOptions ? [makeBrowserTool(browserToolOptions)] : []),
  ...(runCodeTool ? [runCodeTool] : []),
  ...(saveRoutineTool ? [saveRoutineTool] : []),
  ...(saveLearningTool ? [saveLearningTool] : []),
  ...missionTools,
  ...assistantTools,
  ...integrationTools,
  ...(hostReachable
    ? [
        makeRequestProviderConnectionTool(),
        makeRequestHandsOnTool({ personalAssistant }),
      ]
    : []),
  ...customIntegrationTools,
].map(withToolCallLog);
