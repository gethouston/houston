import type { AgentInitialConfig } from "@houston/engine-adapter";
import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { prepareAgentDraftForget } from "../lib/forget-agent-drafts";
import { tauriAgents } from "../lib/tauri";
import type { Agent } from "../lib/types";
import { useAgentProvisioningStore } from "./agent-provisioning";
import type { AgentState } from "./agents/state";
import {
  agentLoadingActions,
  invalidateAgentLoads,
  startAgentSideEffects,
} from "./agents-loading";

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
    get().adopt(agent);
    return { agent };
  },

  delete: async (workspaceId, id) => {
    const wasCurrent = get().current?.id === id;
    // `AgentsChanged` lands before the delete answers, so the roster can drop
    // this agent before the await resumes: capture its keys while it names it.
    const forgetDrafts = prepareAgentDraftForget(id, get().agents);
    await tauriAgents.delete(workspaceId, id);
    // A deleted agent is never "being created" — stop the probe and the UI.
    useAgentProvisioningStore.getState().clearProvisioning(id);
    // The server confirmed the delete — reflect it in the UI NOW. Conversation
    // state lives in the SDK conversation VM (a deleted agent's scopes are
    // never subscribed again) and its uploads died with the agent's workspace.
    forgetDrafts();
    let nextCurrent: Agent | null = null;
    set((s) => {
      const agents = s.agents.filter((a) => a.id !== id);
      const current = wasCurrent ? (agents[0] ?? null) : s.current;
      nextCurrent = current;
      return { agents, current };
    });
    if (wasCurrent && nextCurrent) {
      startAgentSideEffects(nextCurrent);
    }
  },

  rename: async (workspaceId, id, newName) => {
    // The engine renames the folder on disk, so folderPath changes too. Use
    // the returned record instead of patching only `name`, or the stale path
    // survives in the roster and every later per-agent call 404s.
    // Reject a roster snapshot started before the rename: it still carries the
    // removed folder path and would reinstate it after this mutation.
    invalidateAgentLoads();
    const updated = await tauriAgents.rename(workspaceId, id, newName);
    // A rename can change both id and folderPath; a warm-up probe pointed at
    // the old path would 404 and wrongly read as "ready" (HOU-693).
    useAgentProvisioningStore.getState().carryRename(id, updated);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
    }));
    // If we renamed the agent we're viewing, re-select it so the stored
    // "last agent" pick names the surviving folder (the old one is gone).
    if (get().current?.id === id) {
      get().setCurrent(updated);
    }
    return updated;
  },

  updateColor: async (workspaceId, id, color) => {
    const updated = await tauriAgents.updateColor(workspaceId, id, color);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },
}));
