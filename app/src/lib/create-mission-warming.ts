import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { analytics } from "./analytics";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
  CreateMissionResult,
} from "./create-mission";
import { startMissionNow } from "./create-mission-now";
import { warmingPromptInputs } from "./mission-prompt";
import { missionRowInput } from "./mission-row";
import { fallbackMissionTitle } from "./mission-title";
import { newMissionIds } from "./new-mission-ids";

export function createMissionWhileWarming(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): CreateMissionResult {
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;
  const { conversationId, sessionKey } = newMissionIds(opts.conversationId);

  const queued = useAgentProvisioningStore
    .getState()
    .queueWarmingSend(agent.id, {
      agentPath: agent.folderPath,
      sessionKey,
      text,
      ...warmingPromptInputs(opts, conversationId),
      row: missionRowInput({ conversationId, title, description }, opts),
      provider: opts.providerOverride,
      model: opts.modelOverride,
      effort: opts.effortOverride,
      mode: opts.modeOverride,
      mentions: opts.mentions,
      titleText: opts.title ? undefined : titleText,
    });
  if (!queued) {
    startMissionNow(agent, text, opts, {
      conversationId,
      sessionKey,
      title,
      description,
      titleText: opts.title ? undefined : titleText,
    });
  } else {
    analytics.track("mission_created", {
      agent_mode: opts.agentMode,
      provider: opts.providerOverride,
      model: opts.modelOverride,
    });
  }

  return {
    conversationId,
    sessionKey,
    conversation: {
      id: conversationId,
      title,
      description,
      agentName: agent.name,
      agentColor: agent.color,
      status: "running",
      updatedAt: new Date().toISOString(),
      agentPath: agent.folderPath,
    },
  };
}
