import { analytics } from "./analytics";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
  CreateMissionResult,
} from "./create-mission";
import { hiddenPromptDisplayText } from "./hidden-prompt-display-text";
import { logger } from "./logger";
import { hasHiddenPrompt, missionPrompt } from "./mission-prompt";
import { landMissionRow } from "./mission-row-landing";
import {
  fallbackMissionTitle,
  missionTitlePlan,
  titleLandedMission,
} from "./mission-title";
import { newMissionIds } from "./new-mission-ids";
import { showSendFailedToast } from "./send-error-toast";
import { tauriActivity, tauriChat } from "./tauri";

export interface MissionIdentity {
  conversationId: string;
  sessionKey: string;
  title: string;
  description: string;
  titleText?: string;
}

export function startMissionNow(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions,
  mission: MissionIdentity,
): void {
  const row = landMissionRow(agent, opts, mission);
  const titlePlan = missionTitlePlan(
    mission.titleText !== undefined
      ? { fallback: mission.title, text: mission.titleText }
      : undefined,
  );
  void (async () => {
    let prompt = text;
    if (hasHiddenPrompt(opts)) {
      try {
        prompt = await missionPrompt(opts, mission.conversationId, text);
      } catch (e) {
        void row
          .then((id) =>
            id ? tauriActivity.delete(agent.folderPath, id) : null,
          )
          .catch((cleanupErr) => {
            logger.error(`[create-mission-now] rollback failed: ${cleanupErr}`);
          });
        throw e;
      }
    }
    await tauriChat.send(agent.folderPath, prompt, mission.sessionKey, {
      providerOverride: opts.providerOverride,
      modelOverride: opts.modelOverride,
      effortOverride: opts.effortOverride,
      modeOverride: opts.modeOverride,
      mentions: opts.mentions,
      displayText: hiddenPromptDisplayText(text, hasHiddenPrompt(opts)),
      missionTitle: titlePlan.send,
    });
    const landedId = await row;
    if (landedId) titleLandedMission(agent.folderPath, landedId, titlePlan);
  })().catch((e) => {
    showSendFailedToast(e);
  });
  analytics.track("mission_created", {
    agent_mode: opts.agentMode,
    provider: opts.providerOverride,
    model: opts.modelOverride,
  });
}

export function createMissionNow(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): CreateMissionResult {
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;
  const { conversationId, sessionKey } = newMissionIds(opts.conversationId);
  startMissionNow(agent, text, opts, {
    conversationId,
    sessionKey,
    title,
    description,
    titleText: opts.title ? undefined : titleText,
  });
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
