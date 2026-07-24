import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { setActiveOrg } from "../lib/engine";
import { queryClient } from "../lib/query-client";
import { resetCacheForSpaceChange } from "../lib/space-cache";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriPreferences, tauriWorkspaces } from "../lib/tauri";
import type { Workspace } from "../lib/types";
import { resolveActiveWorkspace } from "../lib/workspace-switch";

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  loadWorkspaces: () => Promise<void>;
  setCurrent: (ws: Workspace) => void;
  create: (name: string) => Promise<Workspace>;
  delete: (id: string) => Promise<void>;
  rename: (id: string, newName: string) => Promise<void>;
  /** Set (or clear, with null) the workspace's UI-locale override. */
  setLocale: (id: string, locale: string | null) => Promise<void>;
  /** Drop the workspace list back to its initial (loading) state on an identity
   *  change (HOU-903); the incoming account re-loads its own spaces on boot. */
  reset: () => void;
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
      // Restore the last-selected space alongside the list. On a personal-only
      // host the persisted id resolves to the sole default workspace, so this
      // stays byte-identical to the old isDefault-then-first resolution.
      const [workspaces, lastId] = await Promise.all([
        tauriWorkspaces.list(),
        tauriPreferences.get("last_workspace_id"),
      ]);
      const current = resolveActiveWorkspace(workspaces, lastId);
      // Pin the active space (C8) BEFORE the first space-scoped fetches fire so
      // they carry the right x-houston-org from the start (no header for
      // personal). No cache reset here — nothing has been fetched yet.
      setActiveOrg(current ? orgSlugFromWorkspaceId(current.id) : null);
      set({ workspaces, current, loading: false });
    } catch (e) {
      console.error("[workspaces] Failed to load:", e);
      set({ loading: false });
    }
  },

  setCurrent: (ws) => {
    set({ current: ws });
    tauriPreferences.set("last_workspace_id", ws.id);
    // C8 active space: re-point the gateway to the selected space BEFORE any
    // refetch. On a real space change (personal⇄team or team⇄team) the caller's
    // per-space role and every server answer differ, so drop the whole query
    // cache and let it refetch under the new space — capabilities (role is
    // per-space) refetches with it. setActiveOrg also re-establishes the event
    // stream so its new ?org= applies. A same-space reselect, and every switch
    // on a personal-only host (every id maps to null), changes nothing → no-op.
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

  rename: async (id, newName) => {
    await tauriWorkspaces.rename(id, newName);
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, name: newName } : w,
      ),
      current:
        s.current?.id === id ? { ...s.current, name: newName } : s.current,
    }));
  },

  setLocale: async (id, locale) => {
    const updated = await tauriWorkspaces.setLocale(id, locale);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)),
      current: s.current?.id === id ? updated : s.current,
    }));
  },

  // Mirrors the initial state (loading: true) so the shell shows its splash, not
  // a stale list, until the incoming account's loadWorkspaces() resolves.
  reset: () => set({ workspaces: [], current: null, loading: true }),
}));
