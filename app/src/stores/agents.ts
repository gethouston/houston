import { create } from "zustand";
import {
  tauriAgents,
  tauriAttachments,
  tauriPreferences,
  tauriRoutines,
  tauriWatcher,
} from "../lib/tauri";
import { useFeedStore } from "./feeds";
import { useDraftStore } from "./drafts";
import { analytics } from "../lib/analytics";
import type { Agent } from "../lib/types";

export interface CreatedAgent {
  agent: Agent;
}

interface AgentState {
  agents: Agent[];
  current: Agent | null;
  loading: boolean;
  loadAgents: (
    workspaceId: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  setCurrent: (agent: Agent) => void;
  create: (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
  ) => Promise<CreatedAgent>;
  delete: (workspaceId: string, id: string) => Promise<void>;
  rename: (workspaceId: string, id: string, newName: string) => Promise<void>;
  updateColor: (
    workspaceId: string,
    id: string,
    color: string,
  ) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  current: null,
  loading: false,

  loadAgents: async (workspaceId, options) => {
    const silent = options?.silent ?? false;
    if (!silent) set({ loading: true });
    try {
      const agents = await tauriAgents.list(workspaceId);
      const current = get().current;
      const selected = agents.find((a) => a.id === current?.id) ?? current;
      set({ agents, current: selected, loading: false });
    } catch (e) {
      console.error("[agents] Failed to load:", e);
      set({ loading: false });
    }
  },

  setCurrent: (agent) => {
    set({ current: agent });
    tauriPreferences.set("last_agent_id", agent.id);
    // Start file watcher for AI-native reactivity
    tauriWatcher
      .start(agent.folderPath)
      .catch((e) => console.error("[watcher] Failed to start:", e));
    // Start routine scheduler for this agent
    tauriRoutines
      .startScheduler(agent.folderPath)
      .catch((e) => console.error("[routines] Failed to start scheduler:", e));
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
    );
    analytics.track("agent_created", { config_id: configId });
    const { agent } = result;
    set((s) => ({
      agents: [...s.agents, agent],
      current: agent,
    }));
    tauriPreferences.set("last_agent_id", agent.id);
    // Start file watcher so agent writes (CLAUDE.md, skills) trigger query invalidation
    tauriWatcher
      .start(agent.folderPath)
      .catch((e) => console.error("[watcher] Failed to start:", e));
    return { agent };
  },

  delete: async (workspaceId, id) => {
    // Resolve the agent path before deleting so we can clear its feed bucket.
    const agentPath = get().agents.find((a) => a.id === id)?.folderPath;
    await tauriAgents.delete(workspaceId, id);
    // Wipe any chat composer attachments scoped to this agent's chat.
    // Per-activity attachments are wiped via useDeleteActivity / handleDelete.
    await tauriAttachments.delete(`agent-${id}`).catch(() => {});
    // Drop the feed store bucket for this agent so stale messages don't
    // linger in memory.
    if (agentPath) {
      useFeedStore.getState().clearAgent(agentPath);
    }
    // Clear the free-form chat draft for this agent.
    useDraftStore.getState().clearDraft(`chat-${id}`);
    set((s) => {
      const agents = s.agents.filter((a) => a.id !== id);
      const current = s.current?.id === id ? (agents[0] ?? null) : s.current;
      return { agents, current };
    });
  },

  rename: async (workspaceId, id, newName) => {
    await tauriAgents.rename(workspaceId, id, newName);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, name: newName } : a)),
      current:
        s.current?.id === id ? { ...s.current, name: newName } : s.current,
    }));
  },

  updateColor: async (workspaceId, id, color) => {
    const updated = await tauriAgents.updateColor(workspaceId, id, color);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },
}));
