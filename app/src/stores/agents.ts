import type { AgentInitialConfig } from "@houston/engine-adapter";
import { create } from "zustand";
import { seedBornConfig } from "../lib/agent-provisioning/born-config";
import { tauriAgents } from "../lib/agents-facade";
import { analytics } from "../lib/analytics";
import { queryClient } from "../lib/query-client";
import { useAgentProvisioningStore } from "./agent-provisioning";
import type { AgentState } from "./agents/state";
import { agentLoadingActions, startAgentSideEffects } from "./agents-loading";
import { agentWriteActions } from "./agents-writes";

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
    seedBornConfig(queryClient, agent.folderPath, config);
    get().adopt(agent);
    return { agent };
  },

  ...agentWriteActions(set, get),
}));
