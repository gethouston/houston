import type { AgentInitialConfig } from "@houston/engine-adapter";
import { create } from "zustand";
import { seedBornConfig } from "../lib/agent-provisioning/born-config";
import { tauriAgents } from "../lib/agents-facade";
import { analytics } from "../lib/analytics";
import { queryClient } from "../lib/query-client";
import { useAgentProvisioningStore } from "./agent-provisioning";
import { agentLoadingActions, startAgentSideEffects } from "./agents-loading";
import { agentWriteActions } from "./agents-writes";
import type { AgentState } from "./agents/state";

export type { CreatedAgent } from "./agents/state";

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  current: null,
  loading: false,
  loaded: false,

  loadedWorkspaceId: null,
  ...agentLoadingActions(set, get),

  setCurrent: (agent) => {
    set({ current: agent });
    startAgentSideEffects(agent);
  },

  adopt: (agent) => {
    // Hosted profile: the create answered but the agent's engine is still
    // warming up (HOU-693). Track it so every surface can say so instead of
    // hanging mutely; a readiness probe clears the mark. No-op co-located.
    useAgentProvisioningStore.getState().markProvisioning(agent);
    set((s) => ({
      agents: [...s.agents, agent],
      current: agent,
    }));
    startAgentSideEffects(agent);
  },

  create: async (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
    config?: AgentInitialConfig,
  ) => {
    const result = await tauriAgents.create(
      workspaceId,
      name,
      configId,
      color,
      claudeMd,
      installedPath,
      seeds,
      existingPath,
      config,
    );
    analytics.track("agent_created", { config_id: configId });
    const { agent } = result;
    // Before the agent shows anywhere: a new hire's first-day offer is on its
    // board from the first frame, not after its engine warms up.
    seedBornConfig(queryClient, agent.folderPath, config);
    get().adopt(agent);
    return { agent };
  },

  ...agentWriteActions(set, get),
}));
