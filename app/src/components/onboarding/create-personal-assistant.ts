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

  if (options.provider || options.model) {
    const cfg = await tauriConfig.read(agent.folderPath);
    await tauriConfig.write(agent.folderPath, {
      ...cfg,
      ...(options.provider === "anthropic" || options.provider === "openai"
        ? { provider: options.provider }
        : {}),
      ...(options.model ? { model: options.model } : {}),
    });
  }

  return agent;
}
