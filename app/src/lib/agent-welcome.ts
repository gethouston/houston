/**
 * The new agent's first mission (HOU-713): right after creation, Houston
 * starts a chat FOR the agent so it introduces itself — what it's here to
 * do, a few concrete things it can help with, and what the user would like
 * to start on. The kickoff rides an auto-continue marker message
 * (`lib/auto-continue-message.ts`): the agent receives the instruction, the
 * transcript hides the bubble, so the greeting reads as the agent speaking
 * first.
 *
 * On the hosted profile the agent's engine is still warming up, so the send
 * parks with the warming queue and the board shows the mission optimistically
 * as `running`; the greeting streams in the moment the engine is ready. On a
 * co-located engine it streams right away.
 */

import { useUIStore } from "../stores/ui";
import { encodeAutoContinueMessage } from "./auto-continue-message";
import { type CreateMissionAgent, createMission } from "./create-mission";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";

export async function startAgentWelcomeMission(
  agent: CreateMissionAgent,
  opts: { provider?: string; model?: string } = {},
): Promise<void> {
  // Localized prompt: the agent naturally answers in the app language.
  const prompt = encodeAutoContinueMessage(
    i18n.t("shell:agentWelcome.prompt", { name: agent.name }),
  );
  try {
    const { conversationId } = await createMission(agent, prompt, {
      title: i18n.t("shell:agentWelcome.missionTitle", { name: agent.name }),
      description: i18n.t("shell:agentWelcome.missionDescription"),
      providerOverride: opts.provider,
      modelOverride: opts.model,
    });
    // Open the fresh conversation so the user watches the greeting arrive
    // (or, while the engine still warms up, sees the provisioning card).
    useUIStore
      .getState()
      .setActivityPanelId(conversationId, { forceOpen: true });
    // createMission bypasses useCreateActivity — refetch the board manually.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.activity(agent.folderPath),
    });
  } catch (e) {
    showErrorToast("agent_welcome", i18n.t("shell:agentWelcome.failed"), e);
  }
}
