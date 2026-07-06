/**
 * Mission creation while the agent's engine is still warming up (HOU-693).
 *
 * The normal `createMission` awaits the activity write before starting the
 * turn — against a warming engine that write is held for the whole cold
 * start, so the composer froze with the user's text still in it. This path
 * inverts the flow around one platform guarantee: per-agent requests are
 * answered in arrival order once the engine wakes.
 *
 *  1. Generate the activity id client-side (the host honors it, HOU-693).
 *  2. Queue the board-row POST first — not awaited; it lands when the engine
 *     is up, and being first keeps it ahead of the turn's board-status write.
 *  3. Start the turn immediately: the SDK pushes the user's bubble into the
 *     conversation VM synchronously, and the wire send is held until the
 *     engine answers — so the reply streams in on its own, nothing to resend.
 *
 * The caller gets the id/sessionKey back right away, so the panel opens on
 * the new conversation with the user's message (and the provisioning card)
 * visible.
 */

import { analytics } from "./analytics";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
  CreateMissionResult,
} from "./create-mission";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { fallbackMissionTitle, refreshMissionTitle } from "./mission-title";
import { tauriActivity, tauriChat } from "./tauri";

export async function createMissionWhileWarming(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): Promise<CreateMissionResult> {
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const conversationId = crypto.randomUUID();
  const sessionKey = `activity-${conversationId}`;

  // Fire-and-forget with its own surface: the caller returns before this
  // settles, so a failure here must not stay silent (beta policy).
  void tauriActivity
    .createWithId(agent.folderPath, {
      id: conversationId,
      title,
      description: text,
      agent: opts.agentMode,
      provider: opts.providerOverride,
      model: opts.modelOverride,
    })
    .catch(() => {
      // call() already captured the error for Sentry (toast:false); this is
      // the user-facing half. The turn itself still runs and stays visible
      // in the open panel — only the board card is missing.
      showErrorToast(
        "create_mission_warming",
        i18n.t("chat:errors.missionRowFailed"),
      );
    });

  // No files → resolves synchronously; with files the uploads are held until
  // the engine wakes, and the bubble follows them.
  const prompt = opts.buildPrompt
    ? await opts.buildPrompt(conversationId)
    : text;

  await tauriChat.send(agent.folderPath, prompt, sessionKey, {
    mode: opts.promptFile,
    providerOverride: opts.providerOverride,
    modelOverride: opts.modelOverride,
    effortOverride: opts.effortOverride,
  });

  analytics.track("mission_created", { agent_mode: opts.agentMode });

  if (!opts.title) {
    void refreshMissionTitle({
      agentPath: agent.folderPath,
      activityId: conversationId,
      text: titleText,
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
      description: text,
      agentName: agent.name,
      agentColor: agent.color,
      status: "running",
      updatedAt: new Date().toISOString(),
      agentPath: agent.folderPath,
    },
  };
}
