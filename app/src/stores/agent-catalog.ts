import { create } from "zustand";
import { loadAllConfigs } from "../agents/loader";
import type { AgentDefinition } from "../lib/types";

interface AgentCatalogState {
  agents: AgentDefinition[];
  installedIds: Set<string>;
  loading: boolean;
  loadConfigs: () => Promise<void>;
  getById: (id: string) => AgentDefinition | undefined;
}

export const useAgentCatalogStore = create<AgentCatalogState>((set, get) => ({
  agents: [],
  installedIds: new Set<string>(),
  loading: false,

  loadConfigs: async () => {
    set({ loading: true });
    try {
      const agents = await loadAllConfigs();
      const installedIds = new Set(
        agents
          .filter((a) => a.source === "installed")
          .map((a) => a.config.id),
      );
      set({ agents, installedIds, loading: false });
    } catch (e) {
      console.error("[agent-catalog] Failed to load:", e);
      set({ loading: false });
    }
  },

  getById: (id) => get().agents.find((a) => a.config.id === id),
}));
