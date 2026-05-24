import { create } from "zustand";
import { loadAllConfigs } from "../agents/loader";
import { tauriStore } from "../lib/tauri";
import type { AgentDefinition, StoreListing } from "../lib/types";

interface AgentCatalogState {
  agents: AgentDefinition[];
  storeCatalog: StoreListing[];
  installedIds: Set<string>;
  loading: boolean;
  updatedRepos: string[];
  dismissUpdates: () => void;
  loadConfigs: () => Promise<void>;
  getById: (id: string) => AgentDefinition | undefined;
  installAgent: (listing: StoreListing) => Promise<void>;
  uninstallAgent: (agentId: string) => Promise<void>;
}

export const useAgentCatalogStore = create<AgentCatalogState>((set, get) => ({
  agents: [],
  storeCatalog: [],
  installedIds: new Set<string>(),
  loading: false,
  updatedRepos: [],
  dismissUpdates: () => set({ updatedRepos: [] }),

  loadConfigs: async () => {
    const refreshInstalledConfigs = async () => {
      const agents = await loadAllConfigs();
      const installedIds = new Set(
        agents.filter((a) => a.source === "installed").map((a) => a.config.id),
      );
      set({ agents, installedIds });
    };

    set({ loading: true });
    try {
      await refreshInstalledConfigs();
      set({ loading: false });

      // Fetch store catalog in background (don't block the UI)
      tauriStore
        .fetchCatalog()
        .then((catalog) => set({ storeCatalog: catalog }))
        .catch((e) => console.warn("[agent-catalog] Store fetch failed:", e));

      // Check installed agents for GitHub updates (background)
      tauriStore
        .checkUpdates()
        .then(async (repos) => {
          if (repos.length > 0) {
            console.info("[agent-catalog] Updates found:", repos);
            set({ updatedRepos: repos });
            await refreshInstalledConfigs();
          }
        })
        .catch((e) => console.warn("[agent-catalog] Update check failed:", e));
    } catch (e) {
      console.error("[agent-catalog] Failed to load:", e);
      set({ loading: false });
    }
  },

  getById: (id) => get().agents.find((a) => a.config.id === id),

  installAgent: async (listing) => {
    await tauriStore.install(listing.repo, listing.id);
    // Reload configs so the newly installed agent appears
    await get().loadConfigs();
  },

  uninstallAgent: async (agentId) => {
    await tauriStore.uninstall(agentId);
    await get().loadConfigs();
  },
}));
