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

import { useUIStore } from "../stores/ui";
import { analytics } from "./analytics";
import { createMission } from "./create-mission";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";

const LANGUAGE_NOTE = `**LANGUAGE — read this first.** Detect the user's language from the chat so far (or from your own instructions if the chat is still empty) and reply in that same language for this entire first conversation. For Spanish use Latin-American neutral (tú, computador). For Portuguese use Brazilian (você). Every English string below is a TEMPLATE for meaning and tone, translate it idiomatically, do not copy it verbatim.`;

/**
 * Build the hidden setup-mission prompt for the named agent. Adapted from the
 * old intro directive: same reply-in-the-user's-language idiom and
 * non-technical voice (never mention files, folders, configs, or internals),
 * now framed as a live interview that persists each answer immediately.
 */
export function buildSetupMissionPrompt(agentName: string): string {
  return `This is ${agentName}'s very first conversation with the user. Make a warm, human first impression and help the user set you up so you deliver real value fast. Keep every reply short and warm. Never mention files, folders, configs, or any technical internals, speak in terms of the work you do for them. This is the user's first impression of you.

${LANGUAGE_NOTE}

Do this, in order:

1. Introduce yourself in 2 or 3 short sentences, grounded in YOUR OWN instructions: who you are and what you can take off the user's plate. Be specific to what you were set up to do, not generic.

2. Then propose 2 or 3 concrete example missions you could do for them right now, as a short list, and ask which one they would like to start with (or what else they need).

3. Then interview the user about how you should work for them, and IMMEDIATELY save everything they tell you, through your normal abilities, as they say it. Never batch it up for later:
   - Lasting preferences and facts about how you should behave (their tone, their name, standing do's and don'ts, context about them and their work) go into your instructions.
   - A repeatable procedure they want you to follow again later gets saved as a Skill.
   - Anything they want to happen on a schedule becomes a Routine: ask what time it should run and confirm with them before you create it.
   Capture each thing the moment the user says it, then briefly confirm what you saved in one short line before moving on.

Keep replies short and warm throughout.`;
}

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
        buildPrompt: () => buildSetupMissionPrompt(agent.name),
        providerOverride: opts.provider,
        modelOverride: opts.model,
        effortOverride: "medium",
      },
    );
    analytics.track("agent_onboarding_started", { source });
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
