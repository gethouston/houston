/**
 * The agent's self-setup mission — auto-started right after any agent is
 * created or imported. Instead of a separate onboarding screen, the agent runs
 * a REAL first mission in the normal shell where it introduces itself and
 * interviews the user about how it should work, persisting everything the user
 * says AS THEY SAY IT through its normal abilities (instructions, Skills,
 * Routines). "The agent creates itself."
 *
 * The user never wrote the first message, so there is no user bubble at all:
 * the instructions ride the auto-continue marker (`lib/auto-continue-message.ts`,
 * the same mechanism as the routine / integration / skill setup kickoffs), which
 * the transcript folds away on both the live and the reload path. The mission
 * carries no description either, so nothing of the hidden prompt can surface as
 * the board card's body. No CLAUDE.md mutation, so there is no strip/sweep
 * machinery to leak into later chats.
 *
 * The first thing the user reads is not a model turn at all: the chat renders a
 * hello as the mission's first item, from the name and job this function
 * records at creation (`lib/setup-mission-greeting.ts`), so it is whole before
 * the engine has warmed up and stays there afterwards. The hidden prompt tells
 * the model that message has already been read, and the model continues from it.
 */

import { registerSetupGreeting } from "../hooks/use-setup-greeting";
import { useUIStore } from "../stores/ui";
import type { AgentRoleContext } from "./agent-role-context";
import { AGENT_SETUP_AGENT_MODE } from "./agent-setup-mode";
import { analytics } from "./analytics";
import { encodeAutoContinueMessage } from "./auto-continue-message";
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
  roleContext?: AgentRoleContext,
): Promise<void> {
  try {
    // Empty `text`: the user typed nothing, so the mission has no description
    // and no bubble to render (see the module comment).
    const result = await createMission(agent, "", {
      title: i18n.t("agentOnboarding:setupMission.title"),
      agentMode: AGENT_SETUP_AGENT_MODE,
      buildPrompt: () =>
        encodeAutoContinueMessage(
          buildSetupMissionPrompt(agent.name, i18n.language, roleContext),
        ),
      providerOverride: opts.provider,
      modelOverride: opts.model,
      // One question card needs no deliberation, and every second
      // of thinking here is the user staring at the hello waiting for more.
      effortOverride: "low",
    });
    analytics.track("agent_onboarding_started", { source });
    // The hello's two facts, recorded while they are still in hand. Reading
    // them back off a hosted agent that is only now being provisioned answers
    // nothing, and the hello is the very first thing the user reads.
    // An import brings the source agent's own job description instead of
    // answers (`components/portable/import-install.ts` has no role to pass),
    // so it records none and that mission's hello names the name alone.
    registerSetupGreeting({
      agentPath: agent.folderPath,
      sessionKey: result.sessionKey,
      agentName: agent.name,
      role: roleContext?.role ?? null,
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
