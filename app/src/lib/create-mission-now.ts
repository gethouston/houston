/**
 * Mission creation that answers the instant the user sends (PRODUCT-1643).
 *
 * The normal `createMission` awaits the board row's read-modify-write before
 * starting the turn. Against an asleep hosted pod every per-agent request is
 * held for the whole cold start, so the composer froze with the user's text
 * still in it and no bubble for seconds — read as a dead send button. The
 * asleep check (HOU-730) only routes to the warming queue once it has
 * concluded, and never for a pod that fell asleep while the chat stayed open.
 *
 * This path needs nothing from the pod before the message is on screen:
 *
 *  1. The activity id is generated client-side (the host honors it, HOU-693)
 *     and the board-row POST fires without being awaited — an id-upsert, so
 *     it lands whenever the pod answers.
 *  2. The turn starts right away: the turn stream pushes the user's bubble
 *     synchronously and the thinking indicator takes over, while the wire
 *     send rides the same gateway hold as the row write.
 *
 * The caller gets the id/sessionKey back immediately, so the panel opens on
 * the new conversation with the message visible. A row is not a precondition
 * for a turn (a turn with no card is a transient session); the turn's own
 * status writes match the row by session key once it has landed.
 */

import { isAgentGoneError } from "./agent-gone";
import { analytics } from "./analytics";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
  CreateMissionResult,
} from "./create-mission";
import { getEngine } from "./engine";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { logger } from "./logger";
import { fallbackMissionTitle, refreshMissionTitle } from "./mission-title";
import { healStaleRosterFromError } from "./roster-heal";
import { showSendFailedToast } from "./send-error-toast";
import { tauriActivity, tauriChat } from "./tauri";

/** The identity a mission is born with, decided before anything hits the wire. */
export interface MissionIdentity {
  conversationId: string;
  sessionKey: string;
  title: string;
  description: string;
  /** Source text for the async AI title pass; absent = keep `title`. */
  titleText?: string;
}

/**
 * Land the board row through the host's single id-honoring POST. Resolves the
 * landed id (differs from ours only under version skew — an engine predating
 * client-supplied ids assigned its own, so its row is stamped with our session
 * key to keep the card opening this chat), or null after toasting: losing the
 * card must never lose the message.
 */
async function landMissionRow(
  agent: CreateMissionAgent,
  opts: CreateMissionOptions,
  mission: MissionIdentity,
): Promise<string | null> {
  try {
    const created = await tauriActivity.createWithId(agent.folderPath, {
      id: mission.conversationId,
      title: mission.title,
      description: mission.description,
      agent: opts.agentMode,
      provider: opts.providerOverride,
      model: opts.modelOverride,
    });
    if (created.id !== mission.conversationId) {
      await getEngine().updateActivity(agent.folderPath, created.id, {
        session_key: mission.sessionKey,
      });
    }
    return created.id;
  } catch (e) {
    // The agent vanished under the send (deleted/unshared elsewhere): an
    // expected roster-stale state, healed like the warming flush does — not a
    // bug toast the user can't act on.
    if (isAgentGoneError(e)) {
      healStaleRosterFromError(e);
      return null;
    }
    showErrorToast(
      "create_mission_now",
      "mission row create/update failed",
      e,
      {
        userMessage: i18n.t("chat:errors.missionRowFailed"),
      },
    );
    return null;
  }
}

/**
 * Fire the row write and the turn for an already-identified mission, awaiting
 * neither. Shared by the optimistic create below and the warming path's
 * "turned ready between the check and the queue" fallback.
 */
export function startMissionNow(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions,
  mission: MissionIdentity,
): void {
  const row = landMissionRow(agent, opts, mission);
  void (async () => {
    let prompt = text;
    if (opts.buildPrompt) {
      try {
        prompt = await opts.buildPrompt(mission.conversationId);
      } catch (e) {
        // The attachment save failed: nothing was sent, so the row must not
        // keep a fake running mission on the board (createMission's rollback).
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
      // `buildPrompt` swaps in a prompt the user should not see (a hidden setup
      // directive, or attachment paths appended to their words) — so the bubble
      // renders the clean `text` instead, live and on every history reload.
      displayText: opts.buildPrompt ? text : undefined,
    });
    // The AI title pass needs the row: it lands whenever the pod answers.
    const landedId = await row;
    if (landedId && mission.titleText !== undefined) {
      void refreshMissionTitle({
        agentPath: agent.folderPath,
        activityId: landedId,
        text: mission.titleText,
        provider: opts.providerOverride,
        model: opts.modelOverride,
      });
    }
  })().catch((e) => {
    // The send failed BEFORE a turn stream existed (attachment save, refused
    // start) — nothing wrote to the VM, so the toast is its only surface.
    showSendFailedToast(e);
  });
  analytics.track("mission_created", {
    agent_mode: opts.agentMode,
    provider: opts.providerOverride,
    model: opts.modelOverride,
  });
}

/** `createMission` for a composer send: identity now, wire in the background. */
export function createMissionNow(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): CreateMissionResult {
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;
  const conversationId = crypto.randomUUID();
  const sessionKey = `activity-${conversationId}`;
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
