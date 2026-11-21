import { getConversationFeed } from "../hooks/use-conversation-vm";
import { isAgentGoneError } from "./agent-gone";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning/entry";
import { hiddenPromptDisplayText } from "./hidden-prompt-display-text";
import { logger } from "./logger";
import {
  fallbackMissionTitle,
  missionTitlePlan,
  titleLandedMission,
} from "./mission-title";
import { healStaleRosterFromError } from "./roster-heal";
import { tauriActivity, tauriChat, tauriProvider } from "./tauri";
import {
  preferRowPin,
  type RowPin,
  verifyWarmingSendPin,
} from "./warming-send-pin";
import type { WarmingPromptChoice } from "./warming-send-prompt";

export function abortsFlushAsAgentGone(e: unknown): boolean {
  if (!isAgentGoneError(e)) return false;
  logger.warn(`[warming-sends] agent gone mid-flush, aborting: ${e}`);
  healStaleRosterFromError(e);
  return true;
}

export type WireOutcome = "next" | "abort";

async function pinFor(
  entry: ProvisioningEntry,
  send: PendingWarmingSend,
  activityId: string | undefined,
) {
  let rowPin: RowPin | undefined;
  if (!send.row) {
    try {
      rowPin = (await tauriActivity.list(entry.agentPath)).find(
        (a) =>
          (a.session_key ?? `activity-${a.id}`) === send.sessionKey ||
          a.id === activityId,
      );
    } catch (e) {
      logger.warn(`[warming-sends] mission pin read failed: ${e}`);
    }
  }
  return verifyWarmingSendPin({
    agentId: entry.agentPath,
    activityId,
    pin: preferRowPin(rowPin, {
      provider: send.provider,
      model: send.model,
      effort: send.effort,
    }),
    probe: async (agentId, provider) => {
      const statuses = await tauriProvider.checkAllStatusesForAgent(agentId, [
        provider,
      ]);
      return statuses[provider]?.authenticated === true;
    },
    clearActivityPin: async (agentId, id) => {
      try {
        await tauriActivity.update(agentId, id, {
          provider: null,
          model: null,
        });
      } catch (error) {
        logger.error(`[warming-sends] activity pin clear failed: ${error}`);
      }
    },
  });
}

export async function wireWarmingSend(
  entry: ProvisioningEntry,
  send: PendingWarmingSend,
  wire: WarmingPromptChoice,
  rowId: string | null,
): Promise<WireOutcome> {
  const activityId =
    rowId ??
    (send.sessionKey.startsWith("activity-")
      ? send.sessionKey.slice("activity-".length)
      : undefined);
  const pin = await pinFor(entry, send, activityId);
  const suppress = getConversationFeed(entry.agentPath, send.sessionKey).some(
    (f) => f.feed_type === "user_message",
  );
  const titlePlan = missionTitlePlan(
    send.titleText
      ? { fallback: fallbackMissionTitle(send.titleText), text: send.titleText }
      : undefined,
  );
  try {
    await tauriChat.send(entry.agentPath, wire.prompt, send.sessionKey, {
      providerOverride: pin.provider,
      modelOverride: pin.model,
      effortOverride: pin.effort,
      modeOverride: send.mode,
      mentions: send.mentions,
      grants: send.grants,
      suppressUserBubble: suppress,
      displayText: hiddenPromptDisplayText(send.text, wire.source !== "text"),
      missionTitle: titlePlan.send,
    });
    if (rowId) titleLandedMission(entry.agentPath, rowId, titlePlan);
  } catch (e) {
    if (abortsFlushAsAgentGone(e)) return "abort";
    logger.error(`[warming-sends] deferred send failed: ${e}`);
    return "next";
  }
  return "next";
}
