import type { AgentInitialConfig } from "@houston/engine-adapter";
import { create } from "zustand";
import {
  selectLoadedAgent,
  shouldApplyAgentLoad,
} from "../lib/agent-selection";
import { analytics } from "../lib/analytics";
import { getEngine, isEngineReady } from "../lib/engine";
import { prepareAgentDraftForget } from "../lib/forget-agent-drafts";
import { tauriAgents, tauriPreferences } from "../lib/tauri";
import type { Agent } from "../lib/types";
import { useAgentProvisioningStore } from "./agent-provisioning";
import type { AgentState } from "./agents/state";

export type { CreatedAgent } from "./agents/state";

let loadAgentsGeneration = 0;

/** What selecting an agent leaves behind: the pick survives a restart. The
 *  host owns the file watcher and the routine scheduler for every agent it
 *  serves, so there is nothing per-agent for the client to start. */
function startAgentSideEffects(agent: Agent) {
  tauriPreferences.set("last_agent_id", agent.id);
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  current: null,
  loading: false,
  loaded: false,

  loadAgents: async (workspaceId, options) => {
    const silent = options?.silent ?? false;
    const generation = ++loadAgentsGeneration;
    const selectionBeforeLoad = get().current?.id;
    if (!silent) set({ loading: true });
    try {
      const agents = await tauriAgents.list(workspaceId);
      if (!shouldApplyAgentLoad(generation, loadAgentsGeneration)) return;
      const current = get().current;
      const selected = selectLoadedAgent(agents, current, selectionBeforeLoad);
      set({ agents, current: selected, loading: false, loaded: true });
      if (selected && selected.id !== current?.id) {
        startAgentSideEffects(selected);
      }
    } catch (e) {
      if (!shouldApplyAgentLoad(generation, loadAgentsGeneration)) return;
      console.error("[agents] Failed to load:", e);
      // Settled (with the failure already logged + toasted upstream): the boot
      // gate must not hang on `loaded` forever; an empty-but-failed list reads
      // as the same empty state the legacy wire shows on a failed load.
      set({ loading: false, loaded: true });
    }
  },

  settleEmpty: () => {
    loadAgentsGeneration++;
    // Also tell the engine adapter no list is coming, so provider routing falls
    // back to the persisted selection instead of refusing every call while it
    // waits on a `listAgents` that will never run (HOU-979). Guarded because
    // this settles UI state and must never itself throw; a client that isn't
    // built yet starts in the same unrouted state anyway.
    if (isEngineReady()) getEngine().noteAgentsUnavailable();
    set({ agents: [], current: null, loading: false, loaded: true });
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
    loadAgentsGeneration++;
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

  reset: () => {
    loadAgentsGeneration++;
    set({ agents: [], current: null, loading: false, loaded: false });
  },
}));
