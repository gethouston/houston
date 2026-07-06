import { create } from "zustand";
import { selectCurrentAgent } from "../lib/agent-selection";
import { analytics } from "../lib/analytics";
import {
  tauriAgents,
  tauriPreferences,
  tauriRoutines,
  tauriWatcher,
} from "../lib/tauri";
import type { Agent } from "../lib/types";
import { useAgentProvisioningStore } from "./agent-provisioning";
import { useDraftStore } from "./drafts";

export interface CreatedAgent {
  agent: Agent;
}

function startAgentSideEffects(agent: Agent) {
  tauriPreferences.set("last_agent_id", agent.id);
  // Start file watcher for AI-native reactivity
  tauriWatcher
    .start(agent.folderPath)
    .catch((e) => console.error("[watcher] Failed to start:", e));
  // Start routine scheduler for this agent
  tauriRoutines
    .startScheduler(agent.folderPath)
    .catch((e) => console.error("[routines] Failed to start scheduler:", e));
}

interface AgentState {
  agents: Agent[];
  current: Agent | null;
  loading: boolean;
  /**
   * True once `loadAgents` has settled at least once. `loading` alone can't
   * distinguish "not started yet" from "loaded, empty": boot has an async gap
   * between workspaces resolving and the first `loadAgents` call, and the v3
   * first-run gate (zero agents, HOU-653) must not read `agents: []` in that
   * gap as a fresh install.
   */
  loaded: boolean;
  loadAgents: (
    workspaceId: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  setCurrent: (agent: Agent) => void;
  /**
   * Reveal a freshly created agent: mark it provisioning (HOU-693), append it
   * to the sidebar optimistically, and select it. The tail of `create`, also
   * used by flows that create through another pipeline (agent import,
   * HOU-710) so every creation gets the same optimistic contract.
   */
  adopt: (agent: Agent) => void;
  create: (
    workspaceId: string,
    name: string,
    configId: string,
    color?: string,
    claudeMd?: string,
    installedPath?: string,
    seeds?: Record<string, string>,
    existingPath?: string,
    templateId?: string,
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
  loaded: false,

  loadAgents: async (workspaceId, options) => {
    const silent = options?.silent ?? false;
    if (!silent) set({ loading: true });
    try {
      const agents = await tauriAgents.list(workspaceId);
      const current = get().current;
      const selected = selectCurrentAgent(agents, current);
      set({ agents, current: selected, loading: false, loaded: true });
      if (selected && selected.id !== current?.id) {
        startAgentSideEffects(selected);
      }
    } catch (e) {
      console.error("[agents] Failed to load:", e);
      // Settled (with the failure already logged + toasted upstream): the boot
      // gate must not hang on `loaded` forever; an empty-but-failed list reads
      // as the same empty state the legacy wire shows on a failed load.
      set({ loading: false, loaded: true });
    }
  },

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
    templateId?: string,
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
      templateId,
    );
    analytics.track("agent_created", { config_id: configId });
    const { agent } = result;
    get().adopt(agent);
    return { agent };
  },

  delete: async (workspaceId, id) => {
    const wasCurrent = get().current?.id === id;
    await tauriAgents.delete(workspaceId, id);
    // A deleted agent is never "being created" — stop the probe and the UI.
    useAgentProvisioningStore.getState().clearProvisioning(id);
    // The server confirmed the delete — reflect it in the UI NOW.
    // Conversation state lives in the SDK conversation VM; a deleted agent's
    // scopes are simply never subscribed again. Uploaded files need no
    // cleanup either: they live in the agent's workspace, which died with it.
    // Clear the free-form chat draft for this agent.
    useDraftStore.getState().clearDraft(`chat-${id}`);
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
    // later reaches tauriWatcher.start and the watch fails with a "neither a
    // file nor a directory" error toast (#298).
    const updated = await tauriAgents.rename(workspaceId, id, newName);
    // A rename can change both id and folderPath; a warm-up probe pointed at
    // the old path would 404 and wrongly read as "ready" (HOU-693).
    useAgentProvisioningStore.getState().carryRename(id, updated);
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
