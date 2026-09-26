import type { StoreApi } from "zustand";
import { createAgentLoadOrder } from "../lib/agent-load-order";
import { selectLoadedAgent } from "../lib/agent-selection";
import { getEngine, isEngineReady } from "../lib/engine";
import { logAndReportError } from "../lib/error-report";
import { tauriAgents, tauriPreferences } from "../lib/tauri";
import type { Agent } from "../lib/types";
import type { AgentState } from "./agents/state";

const loadOrder = createAgentLoadOrder();

export function invalidateAgentLoads(): void {
  loadOrder.invalidate();
}

export function startAgentSideEffects(agent: Agent): void {
  tauriPreferences.set("last_agent_id", agent.id);
}

export function agentLoadingActions(
  set: StoreApi<AgentState>["setState"],
  get: StoreApi<AgentState>["getState"],
): Pick<AgentState, "loadAgents" | "settleEmpty" | "reset"> {
  return {
    loadAgents: async (workspaceId, options) => {
      const silent = options?.silent ?? false;
      const load = loadOrder.begin(silent);
      const selectionBeforeLoad = get().current?.id;
      if (!silent) set({ loading: true });
      /** False when a newer load or a mutation superseded this one. */
      const lands = () => {
        const outcome = loadOrder.settle(load);
        if (outcome === "drop-and-settle") set({ loading: false });
        return outcome === "apply";
      };
      try {
        const agents = await tauriAgents.list(workspaceId);
        if (!lands()) return;
        const current = get().current;
        const selected = selectLoadedAgent(
          agents,
          current,
          selectionBeforeLoad,
        );
        set({
          agents,
          current: selected,
          loading: false,
          loaded: true,
          loadedWorkspaceId: workspaceId,
        });
        if (selected && selected.id !== current?.id) {
          startAgentSideEffects(selected);
        }
      } catch (error) {
        if (!lands()) return;
        logAndReportError("agents_load", error);
        set((state) => ({
          ...(state.loadedWorkspaceId === workspaceId
            ? {}
            : { agents: [], current: null }),
          loading: false,
          loaded: true,
          loadedWorkspaceId: workspaceId,
        }));
      }
    },

    settleEmpty: () => {
      invalidateAgentLoads();
      if (isEngineReady()) getEngine().noteAgentsUnavailable();
      set({
        agents: [],
        current: null,
        loading: false,
        loaded: true,
        loadedWorkspaceId: null,
      });
    },

    reset: () => {
      invalidateAgentLoads();
      set({
        agents: [],
        current: null,
        loading: false,
        loaded: false,
        loadedWorkspaceId: null,
      });
    },
  };
}
