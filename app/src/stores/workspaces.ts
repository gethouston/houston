import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { tauriPreferences, tauriWorkspaces } from "../lib/tauri";
import type { Workspace } from "../lib/types";

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  loadWorkspaces: () => Promise<void>;
  setCurrent: (ws: Workspace) => void;
  create: (name: string) => Promise<Workspace>;
  delete: (id: string) => Promise<void>;
  /** Set (or clear, with null) the workspace's UI-locale override. */
  setLocale: (id: string, locale: string | null) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  current: null,
  // Start true so App.tsx renders the loading splash on first paint instead of
  // the tutorial. Returning users with an existing workspace would otherwise
  // briefly fall through the `workspaces.length === 0` gate and mount the
  // onboarding orchestrator before `loadWorkspaces()` resolves, which then
  // pinned `tutorialActive=true` and trapped them in the tutorial.
  loading: true,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      const workspaces = await tauriWorkspaces.list();
      const current =
        workspaces.find((w) => w.isDefault) ?? workspaces[0] ?? null;
      set({ workspaces, current, loading: false });
    } catch (e) {
      console.error("[workspaces] Failed to load:", e);
      set({ loading: false });
    }
  },

  setCurrent: (ws) => {
    set({ current: ws });
    tauriPreferences.set("last_workspace_id", ws.id);
  },

  create: async (name) => {
    const ws = await tauriWorkspaces.create(name);
    analytics.track("workspace_created", { source: "manual" });
    set((s) => ({
      workspaces: [...s.workspaces, ws],
    }));
    return ws;
  },

  delete: async (id) => {
    await tauriWorkspaces.delete(id);
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const current =
        s.current?.id === id
          ? (workspaces.find((w) => w.isDefault) ?? workspaces[0] ?? null)
          : s.current;
      return { workspaces, current };
    });
  },

  setLocale: async (id, locale) => {
    const updated = await tauriWorkspaces.setLocale(id, locale);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },
}));
