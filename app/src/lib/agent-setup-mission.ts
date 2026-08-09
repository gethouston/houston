/**
 * The agent's self-setup mission — auto-started right after any agent is
 * created or imported. Instead of a separate onboarding screen, the agent runs
 * a REAL first mission in the normal shell where it introduces itself and
 * interviews the user about how it should work, persisting everything the user
 * says AS THEY SAY IT through its normal abilities (instructions, Skills,
 * Routines). "The agent creates itself."
 *
 * The kickoff line the user sees on the board is the visible bubble
 * (`agentOnboarding:setupMission.kickoff`); the real instructions ride the
 * hidden `buildPrompt` so they reach the engine without ever rendering as a
 * user chat line (see `createMission`'s `buildPrompt`). No CLAUDE.md mutation,
 * so there is no strip/sweep machinery to leak into later chats.
 */

import { registerSetupGreeting } from "../hooks/use-setup-greeting";
import { useUIStore } from "../stores/ui";
import { analytics } from "./analytics";
import { createMission } from "./create-mission";
import { publishCreatedMission } from "./created-mission-handoff";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { buildSetupMissionPrompt } from "./setup-mission-prompt";

/**
 * Auto-start the agent's self-setup mission and open its chat. Fire-and-forget
 * from the caller (create dialog / import wizard): the mission must start
 * regardless of what happens to the dialog afterwards.
 *
 * On a warming (hosted) agent `createMission` queues the send and returns
 * without throwing, surfacing its own toast on a real failure; on the local
 * path it throws, which we catch and surface here. Never silent.
 */
export async function startAgentSetupMission(
  agent: { id: string; name: string; color?: string; folderPath: string },
  opts: { provider?: string; model?: string },
  source: "created" | "imported",
): Promise<void> {
  try {
    const result = await createMission(
      agent,
      i18n.t("agentOnboarding:setupMission.kickoff"),
      {
        title: i18n.t("agentOnboarding:setupMission.title"),
        buildPrompt: () => buildSetupMissionPrompt(agent.name, i18n.language),
        providerOverride: opts.provider,
        modelOverride: opts.model,
        effortOverride: "medium",
      },
    );
    analytics.track("agent_onboarding_started", { source });
    // Instant first impression (HOU-867): the model's real intro can't run
    // until the pod is warm, so the chat derives a localized hello meanwhile
    // and drops it when the intro streams in.
    registerSetupGreeting({
      agentPath: agent.folderPath,
      sessionKey: result.sessionKey,
      agentName: agent.name,
    });
    // Name the mission for the board BEFORE its panel opens: the sweep has
    // not returned this row yet, and on a co-located engine there is no
    // warming entry to carry it either, so without this the panel opens with
    // no session key and no agent path — a blank welcome chat.
    publishCreatedMission({
      activityId: result.conversationId,
      agentPath: agent.folderPath,
      sessionKey: result.sessionKey,
    });
    // Open the chat on the new mission, like the old welcome flow did.
    useUIStore
      .getState()
      .setActivityPanelId(result.conversationId, { forceOpen: true });
  } catch (e) {
    showErrorToast("agent_setup_mission", "setup mission start failed", e, {
      userMessage: i18n.t("agentOnboarding:setupMission.startFailed"),
    });
  }
}
