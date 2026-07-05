import { logger } from "../../lib/logger";
import { tauriConfig } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { PERSONAL_ASSISTANT_CONFIG_ID } from "./personal-assistant-artifacts";

interface CreatePersonalAssistantOptions {
  name: string;
  instructions: string;
  color?: string;
  provider?: string;
  model?: string;
}

export async function createPersonalAssistantForWorkspace(
  workspaceId: string,
  options: CreatePersonalAssistantOptions,
): Promise<Agent> {
  const { agent } = await useAgentStore
    .getState()
    .create(
      workspaceId,
      options.name,
      PERSONAL_ASSISTANT_CONFIG_ID,
      options.color ?? "navy",
      options.instructions,
    );

  // The provider/model write dispatches to the agent's engine, which on the
  // hosted profile is a pod still cold-starting — awaiting it would stall the
  // whole first-run onboarding on the pod warm-up (HOU-649). The agent already
  // exists; write the config in the background so the "assistant created" screen
  // shows immediately. It lands well before the user can send their first
  // message (the pod must finish warming for that too), and a failure surfaces
  // via the tauri wrapper's own error toast.
  if (options.provider || options.model) {
    void applyProviderModel(agent.folderPath, options);
  }

  return agent;
}

async function applyProviderModel(
  agentPath: string,
  options: CreatePersonalAssistantOptions,
): Promise<void> {
  try {
    const cfg = await tauriConfig.read(agentPath);
    await tauriConfig.write(agentPath, {
      ...cfg,
      ...(options.provider === "anthropic" || options.provider === "openai"
        ? { provider: options.provider }
        : {}),
      ...(options.model ? { model: options.model } : {}),
    });
  } catch (e) {
    // The tauri wrapper already showed a red error toast; leave a breadcrumb.
    logger.error(`[onboarding] provider/model write failed: ${e}`);
  }
}
