/**
 * The last step of a queued warming send (`warming-sends.ts`): verify its
 * pin against the now-awake engine and put the turn on the wire.
 */

import { getConversationFeed } from "../hooks/use-conversation-vm";
import { isAgentGoneError } from "./agent-gone";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "./agent-provisioning/entry";
import { hiddenPromptDisplayText } from "./hidden-prompt-display-text";
import { logger } from "./logger";
import { refreshMissionTitle } from "./mission-title";
import { healStaleRosterFromError } from "./roster-heal";
import { tauriActivity, tauriChat, tauriProvider } from "./tauri";
import {
  preferRowPin,
  type RowPin,
  verifyWarmingSendPin,
} from "./warming-send-pin";
import type { WarmingPromptChoice } from "./warming-send-prompt";

/**
 * True when this refusal means the agent vanished between the readiness probe
 * and the write (deleted/unshared elsewhere, HOUSTON-APP-4ZF): every remaining
 * send is doomed to the same "agent not found" 404, so the flush stops and the
 * roster heals instead of surfacing a state the user cannot act on. The probe's
 * own gone-check catches this before the flush starts; this guards the
 * in-flight race.
 */
export function abortsFlushAsAgentGone(e: unknown): boolean {
  if (!isAgentGoneError(e)) return false;
  logger.warn(`[warming-sends] agent gone mid-flush, aborting: ${e}`);
  healStaleRosterFromError(e);
  return true;
}

/** What the flush does after a send: carry on, or stop (the agent is gone). */
export type WireOutcome = "next" | "abort";

async function pinFor(
  entry: ProvisioningEntry,
  send: PendingWarmingSend,
  activityId: string | undefined,
) {
  // A parked follow-up (no row of its own) carries the composer's guess at
  // the mission's pin — the pod answers now, so read the row's stored pin
  // before verifying it (PRODUCT-1643). A failed read keeps the guess: the
  // wrapper already reported it, and the message still delivers.
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

/** Sends one queued turn. */
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
  // The bubble is already on screen (pushed at queue time, or restored on
  // rehydrate) — never double it. If the scope is somehow empty (renamed
  // agent moved the VM scope), let the turn push it.
  const suppress = getConversationFeed(entry.agentPath, send.sessionKey).some(
    (f) => f.feed_type === "user_message",
  );
  try {
    await tauriChat.send(entry.agentPath, wire.prompt, send.sessionKey, {
      providerOverride: pin.provider,
      modelOverride: pin.model,
      effortOverride: pin.effort,
      modeOverride: send.mode,
      mentions: send.mentions,
      suppressUserBubble: suppress,
      // A prompt from either hidden source (built now, or resolved at queue
      // time) means the bubble must show the user's words instead.
      displayText: hiddenPromptDisplayText(send.text, wire.source !== "text"),
    });
    // The AI title pass this mission skipped at queue time (HOU-713): the
    // row just landed and the engine answers now. Fire-and-forget — a
    // failure keeps the fallback title (refreshMissionTitle logs it).
    if (rowId && send.titleText) {
      void refreshMissionTitle({
        agentPath: entry.agentPath,
        activityId: rowId,
        text: send.titleText,
      });
    }
  } catch (e) {
    if (abortsFlushAsAgentGone(e)) return "abort";
    // tauriChat.send already toasted the real reason; keep flushing the
    // rest — one refused turn must not strand the queue.
    logger.error(`[warming-sends] deferred send failed: ${e}`);
    return "next";
  }
  return "next";
}
