import { create } from "zustand";
import { tauriAgents, tauriAttachments, tauriPreferences, tauriRoutines, tauriWatcher } from "../lib/tauri";
import { useFeedStore } from "./feeds";
import { useDraftStore } from "./drafts";
import { analytics } from "../lib/analytics";
import { selectCurrentAgent } from "../lib/agent-selection";
import type { Agent } from "../lib/types";

export interface CreatedAgent {
  agent: Agent;
}

function startAgentSideEffects(agent: Agent) {
  tauriPreferences.set("last_agent_id", agent.id);
  // Start file watcher for AI-native reactivity
  tauriWatcher.start(agent.folderPath).catch((e) =>
    console.error("[watcher] Failed to start:", e),
  );
  // Start routine scheduler for this agent
  tauriRoutines.startScheduler(agent.folderPath).catch((e) =>
    console.error("[routines] Failed to start scheduler:", e),
  );
}

interface AgentState {
  agents: Agent[];
  current: Agent | null;
  loading: boolean;
  loadAgents: (workspaceId: string, options?: { silent?: boolean }) => Promise<void>;
  setCurrent: (agent: Agent) => void;
  create: (workspaceId: string, name: string, configId: string, color?: string, claudeMd?: string, installedPath?: string, seeds?: Record<string, string>, existingPath?: string) => Promise<CreatedAgent>;
  delete: (workspaceId: string, id: string) => Promise<void>;
  rename: (workspaceId: string, id: string, newName: string) => Promise<void>;
  updateColor: (workspaceId: string, id: string, color: string) => Promise<void>;
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
      const selected = selectCurrentAgent(agents, current);
      set({ agents, current: selected, loading: false });
      if (selected && selected.id !== current?.id) {
        startAgentSideEffects(selected);
      }
    } catch (e) {
      console.error("[agents] Failed to load:", e);
      set({ loading: false });
    }
  },

  setCurrent: (agent) => {
    set({ current: agent });
    startAgentSideEffects(agent);
  },

  create: async (workspaceId: string, name: string, configId: string, color?: string, claudeMd?: string, installedPath?: string, seeds?: Record<string, string>, existingPath?: string) => {
    const result = await tauriAgents.create(workspaceId, name, configId, color, claudeMd, installedPath, seeds, existingPath);
    analytics.track("agent_created", { config_id: configId });
    const { agent } = result;
    set((s) => ({
      agents: [...s.agents, agent],
      current: agent,
    }));
    startAgentSideEffects(agent);
    return { agent };
  },

  delete: async (workspaceId, id) => {
    // Resolve the agent path before deleting so we can clear its feed bucket.
    const agentPath = get().agents.find((a) => a.id === id)?.folderPath;
    const wasCurrent = get().current?.id === id;
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
    let nextCurrent: Agent | null = null;
    set((s) => {
      const agents = s.agents.filter((a) => a.id !== id);
      const current = wasCurrent ? agents[0] ?? null : s.current;
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
    // later reaches tauriWatcher.start and the watch fails with a "neither a
    // file nor a directory" error toast (#298).
    const updated = await tauriAgents.rename(workspaceId, id, newName);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
    }));
    // If we renamed the agent we're viewing, re-select it so the file watcher
    // and routine scheduler repoint at the new folder (the old one is gone).
    if (get().current?.id === id) {
      get().setCurrent(updated);
    }
  },

  updateColor: async (workspaceId, id, color) => {
    const updated = await tauriAgents.updateColor(workspaceId, id, color);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },
}));
