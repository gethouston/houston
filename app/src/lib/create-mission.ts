import type { MessageMention } from "@houston/engine-adapter";
import { isAgentProvisioning } from "../stores/agent-provisioning";
import { activityRowPin, definedPins } from "./agent-model-overrides";
import { analytics } from "./analytics";
import { createMissionNow } from "./create-mission-now";
import { createMissionWhileWarming } from "./create-mission-warming";
import { hiddenPromptDisplayText } from "./hidden-prompt-display-text";
import { logger } from "./logger";
import {
  hasHiddenPrompt,
  type MissionPromptOptions,
  missionPrompt,
} from "./mission-prompt";
import {
  fallbackMissionTitle,
  missionTitlePlan,
  titleLandedMission,
} from "./mission-title";
import { tauriActivity, tauriChat } from "./tauri";

function sessionKeyForActivity(activityId: string): string {
  return `activity-${activityId}`;
}
function nowIso(): string {
  return new Date().toISOString();
}

export interface Conversation {
  id: string;
  title: string;
  description?: string;
  agentName: string;
  agentColor?: string;
  status: string;
  updatedAt: string;
  agentPath: string;
}

export function autoTitleFromText(text: string): string {
  return fallbackMissionTitle(text);
}

export interface CreateMissionAgent {
  id: string;
  name: string;
  color?: string;
  folderPath: string;
}

export interface CreateMissionOptions extends MissionPromptOptions {
  agentMode?: string;
  providerOverride?: string;
  modelOverride?: string;
  effortOverride?: string;
  modeOverride?: "execute" | "plan" | "auto";
  mentions?: MessageMention[];
  title?: string;
  titleText?: string;
  conversationId?: string;
  optimistic?: boolean;
}

export interface CreateMissionResult {
  conversationId: string;
  sessionKey: string;
  conversation: Conversation;
}

export async function createMission(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): Promise<CreateMissionResult> {
  if (isAgentProvisioning(agent.id)) {
    return createMissionWhileWarming(agent, text, opts);
  }
  if (opts.optimistic) return createMissionNow(agent, text, opts);
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;

  const rowPin = activityRowPin(opts);
  const item = await tauriActivity.create(
    agent.folderPath,
    title,
    description,
    opts.agentMode,
    rowPin.provider,
    rowPin.model,
    opts.modeOverride,
  );
  const conversationId = item.id;
  const sessionKey = sessionKeyForActivity(conversationId);

  try {
    const prompt = await missionPrompt(opts, conversationId, text);
    const titlePlan = missionTitlePlan(
      opts.title ? undefined : { fallback: title, text: titleText },
    );

    await tauriChat.send(agent.folderPath, prompt, sessionKey, {
      ...definedPins(opts),
      modeOverride: opts.modeOverride,
      mentions: opts.mentions,
      displayText: hiddenPromptDisplayText(text, hasHiddenPrompt(opts)),
      missionTitle: titlePlan.send,
    });

    analytics.track("mission_created", {
      agent_mode: opts.agentMode,
      provider: opts.providerOverride,
      model: opts.modelOverride,
    });

    titleLandedMission(agent.folderPath, conversationId, titlePlan);
  } catch (e) {
    try {
      await tauriActivity.delete(agent.folderPath, conversationId);
    } catch (cleanupErr) {
      logger.error(`[create-mission] rollback failed: ${cleanupErr}`);
    }
    throw e;
  }

  const conversation: Conversation = {
    id: conversationId,
    title,
    description,
    agentName: agent.name,
    agentColor: agent.color,
    status: "running",
    updatedAt: nowIso(),
    agentPath: agent.folderPath,
  };

  return { conversationId, sessionKey, conversation };
}
