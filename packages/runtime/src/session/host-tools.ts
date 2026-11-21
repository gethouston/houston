import { assistantOptions } from "./assistant-family";
import { personalAssistant } from "./runtime-role";
import { sandboxCall } from "./sandbox-call";
import { makeAgentDirectoryTools } from "./tools/agent-directory";
import { credentialTools } from "./tools/credential-tools";
import { makeIntegrationTools } from "./tools/integrations";
import { makeMissionTools } from "./tools/missions";
import { makeReadMissionTool } from "./tools/read-mission";
import { makeSaveLearningTool } from "./tools/save-learning";
import { makeSaveRoutineTool } from "./tools/save-routine";

export const hostReachable = sandboxCall !== null;

export const integrationTools = sandboxCall
  ? makeIntegrationTools({ call: sandboxCall })
  : [];

export const customIntegrationTools = credentialTools({
  personalAssistant,
  ...(assistantOptions ? { assistant: assistantOptions } : {}),
  ...(sandboxCall ? { integrations: { call: sandboxCall } } : {}),
});

export const saveRoutineTool = sandboxCall
  ? makeSaveRoutineTool({ call: sandboxCall })
  : null;

export const saveLearningTool = sandboxCall
  ? makeSaveLearningTool({ call: sandboxCall })
  : null;

export const missionTools = sandboxCall
  ? [
      ...makeMissionTools({ call: sandboxCall, personalAssistant }),
      makeReadMissionTool({ call: sandboxCall, personalAssistant }),
      ...(personalAssistant
        ? []
        : makeAgentDirectoryTools({ call: sandboxCall })),
    ]
  : [];

export const hostIntegrations = sandboxCall ? { call: sandboxCall } : undefined;
