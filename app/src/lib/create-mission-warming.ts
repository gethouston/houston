/**
 * Mission creation while the agent's engine is still warming up (HOU-693).
 *
 * The normal `createMission` awaits the activity write before starting the
 * turn — against a warming engine that write is held for the whole cold
 * start, so the composer froze with the user's text still in it. This path
 * answers immediately instead:
 *
 *  1. Generate the activity id client-side (the host honors it, HOU-693) and
 *     fire the board-row POST without awaiting — it lands when the engine
 *     wakes, and the request itself nudges the warm-up along.
 *  2. Render the user's message as a local bubble and QUEUE the send with the
 *     provisioning entry (`lib/warming-sends.ts`). No held wire send: a held
 *     request dies with infrastructure timeouts or a reload, silently eating
 *     the message. The queued send fires when the readiness probe clears, and
 *     survives a relaunch via the entry's persisted mirror.
 *
 * The caller gets the id/sessionKey back right away, so the panel opens on
 * the new conversation with the message (and the provisioning card) visible.
 */

import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { analytics } from "./analytics";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
  CreateMissionResult,
} from "./create-mission";
import { getEngine } from "./engine";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { fallbackMissionTitle, refreshMissionTitle } from "./mission-title";
import { tauriActivity, tauriChat } from "./tauri";

export function createMissionWhileWarming(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): CreateMissionResult {
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;
  const conversationId = crypto.randomUUID();
  const sessionKey = `activity-${conversationId}`;

  // The board row rides the queued send and is WRITTEN at flush time (engine
  // awake, id-upsert idempotent) — a write fired now would be a held request
  // that dies with a reload, silently losing the mission from the board. The
  // board still shows the card immediately: it overlays the queued row as a
  // running mission (`lib/warming-board-rows.ts`, HOU-713). The AI title pass
  // can't run against a warming engine either, so `titleText` rides the send
  // and the flush fires it once the row lands.
  const queued = useAgentProvisioningStore
    .getState()
    .queueWarmingSend(agent.id, {
      agentPath: agent.folderPath,
      sessionKey,
      text,
      buildPrompt: opts.buildPrompt
        ? () => opts.buildPrompt?.(conversationId) ?? text
        : undefined,
      row: {
        id: conversationId,
        title,
        description,
        agent: opts.agentMode,
        provider: opts.providerOverride,
        model: opts.modelOverride,
      },
      promptFile: opts.promptFile,
      provider: opts.providerOverride,
      model: opts.modelOverride,
      effort: opts.effortOverride,
      mode: opts.modeOverride,
      titleText: opts.title ? undefined : titleText,
    });
  if (!queued) {
    // The agent turned ready between the caller's provisioning check and the
    // queue — the engine answers now: write the row and send like any turn.
    void (async () => {
      try {
        const created = await tauriActivity.createWithId(agent.folderPath, {
          id: conversationId,
          title,
          description,
          agent: opts.agentMode,
          provider: opts.providerOverride,
          model: opts.modelOverride,
        });
        if (created.id !== conversationId) {
          // Version skew: the engine predates client-supplied ids (HOU-693) —
          // stamp our session key on its row so the card opens this chat.
          await getEngine().updateActivity(agent.folderPath, created.id, {
            session_key: sessionKey,
          });
        }
      } catch {
        showErrorToast(
          "create_mission_warming",
          "mission row create/update failed",
          undefined,
          { userMessage: i18n.t("chat:errors.missionRowFailed") },
        );
      }
      const prompt = opts.buildPrompt
        ? await opts.buildPrompt(conversationId)
        : text;
      await tauriChat.send(agent.folderPath, prompt, sessionKey, {
        mode: opts.promptFile,
        providerOverride: opts.providerOverride,
        modelOverride: opts.modelOverride,
        effortOverride: opts.effortOverride,
        modeOverride: opts.modeOverride,
      });
      // The engine answers now, so the AI title pass runs like the normal
      // path's (createMission fires it right after the first send).
      if (!opts.title) {
        void refreshMissionTitle({
          agentPath: agent.folderPath,
          activityId: conversationId,
          text: titleText,
          provider: opts.providerOverride,
          model: opts.modelOverride,
        });
      }
    })().catch(() => {
      // tauriChat.send toasted the real reason already.
    });
  }

  analytics.track("mission_created", { agent_mode: opts.agentMode });

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
