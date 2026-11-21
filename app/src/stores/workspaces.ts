import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { setActiveOrg, setPreferenceErrorReporter } from "../lib/engine";
import { queryClient } from "../lib/query-client";
import { resetCacheForSpaceChange } from "../lib/space-cache";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import {
  type EngineCallOptions,
  tauriPreferences,
  tauriWorkspaces,
} from "../lib/tauri";
import type { Workspace } from "../lib/types";
import { reportWorkspacePreferenceError } from "../lib/workspace-preference-error";
import {
  planSpacesRefresh,
  withoutPendingDeletes,
} from "../lib/workspace-refresh";
import {
  pendingWorkspaceDeletes,
  runWorkspaceDelete,
  type WorkspaceDeleteMode,
} from "./workspace-delete";
import {
  type LocaleWriteOutcome,
  workspaceLocaleWrites,
} from "./workspace-locale-writes";
import { applyRefreshPlan } from "./workspace-refresh-apply";

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  loaded: boolean;
  loadError: boolean;
  loadWorkspaces: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  setCurrent: (ws: Workspace) => void;
  create: (name: string) => Promise<Workspace>;
  delete: (
    id: string,
    options?: EngineCallOptions,
    mode?: WorkspaceDeleteMode,
  ) => Promise<void>;
  setLocale: (id: string, locale: string | null) => Promise<LocaleWriteOutcome>;
  reset: () => void;
}

let loadGeneration = 0;

setPreferenceErrorReporter(reportWorkspacePreferenceError);

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  setLocale: workspaceLocaleWrites({
    read: (id) => get().workspaces.find((w) => w.id === id)?.locale,
    swap: (id, next) =>
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.id === id ? next(w) : w)),
        current: s.current?.id === id ? next(s.current) : s.current,
      })),
    write: (id, locale) => tauriWorkspaces.setLocale(id, locale),
  }),

  workspaces: [],
  current: null,
  loading: true,
  loaded: false,
  loadError: false,

  loadWorkspaces: async () => {
    const generation = loadGeneration;
    set({ loading: true });
    try {
      const listed = tauriWorkspaces
        .list()
        .then((rows) => withoutPendingDeletes(rows, pendingWorkspaceDeletes));
      const resolution = get().current
        ? null
        : tauriPreferences.resolveWorkspace(listed);
      const [workspaces, current] = await Promise.all([listed, resolution]);
      if (generation !== loadGeneration) return;
      const shown = get().current;
      if (shown) {
        applyRefreshPlan(
          planSpacesRefresh(get().workspaces, shown, workspaces),
          set,
        );
        set({ loadError: false });
      } else {
        setActiveOrg(current ? orgSlugFromWorkspaceId(current.id) : null);
        set({ workspaces, current, loadError: false });
      }
    } catch {
      if (generation === loadGeneration) set({ loadError: true });
    } finally {
      if (generation === loadGeneration) set({ loading: false, loaded: true });
    }
  },

  refreshWorkspaces: async () => {
    const before = get();
    if (!before.loaded || before.loading) return;
    let fresh: Workspace[];
    try {
      fresh = await tauriWorkspaces.listQuiet();
    } catch {
      return;
    }
    fresh = withoutPendingDeletes(fresh, pendingWorkspaceDeletes);
    const prev = get();
    if (prev.loading) return;
    applyRefreshPlan(
      planSpacesRefresh(prev.workspaces, prev.current, fresh),
      set,
    );
  },

  setCurrent: (ws) => {
    set({ current: ws });
    void tauriPreferences.set("last_workspace_id", ws.id).catch((err) => {
      reportWorkspacePreferenceError("write", err);
    });
    const orgChanged = setActiveOrg(orgSlugFromWorkspaceId(ws.id));
    resetCacheForSpaceChange(queryClient, orgChanged);
  },

  create: async (name) => {
    const ws = await tauriWorkspaces.create(name);
    analytics.track("workspace_created", { source: "manual" });
    set((s) => ({
      workspaces: [...s.workspaces, ws],
    }));
    return ws;
  },

  delete: (id, options, mode = "server-first") =>
    runWorkspaceDelete(id, options, get, set, mode),

  reset: () => {
    loadGeneration++;
    pendingWorkspaceDeletes.clear();
    set({ workspaces: [], current: null, loading: true });
  },
}));
