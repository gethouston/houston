import { create } from "zustand";
import { analytics } from "../lib/analytics";
import { setActiveOrg } from "../lib/engine";
import { queryClient } from "../lib/query-client";
import { resetCacheForSpaceChange } from "../lib/space-cache";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import {
  type EngineCallOptions,
  tauriPreferences,
  tauriWorkspaces,
} from "../lib/tauri";
import type { Workspace } from "../lib/types";
import {
  planSpacesRefresh,
  withoutPendingDeletes,
} from "../lib/workspace-refresh";
import { resolveActiveWorkspace } from "../lib/workspace-switch";
import {
  pendingWorkspaceDeletes,
  runWorkspaceDelete,
} from "./workspace-delete";
import { applyRefreshPlan } from "./workspace-refresh-apply";

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  /** A load is in flight — the FIRST one or any later retry/refresh. */
  loading: boolean;
  /** At least one load attempt has settled, success or failure. Distinct from
   *  `!loading`: it stays true across every later retry, which is what lets the
   *  boot splash cover only the initial load (App.tsx) while a retry spins in
   *  place inside whichever screen asked for it. */
  loaded: boolean;
  /** The last settled load threw. Cleared on success, so a settled state with
   *  no current workspace can be told apart: `loadError` = the load failed
   *  (blame the connection, offer a retry), no error = the account genuinely
   *  has no workspace (a neutral empty state). */
  loadError: boolean;
  loadWorkspaces: () => Promise<void>;
  /** Background space-list sync (HOU live-spaces): re-lists quietly and merges
   *  changes in place — a space the user was just added to appears without a
   *  relaunch, and a space they were removed from disappears (falling back to
   *  the default space when it was the active one). Never flips `loading`, so
   *  no screen re-splashes; failures are logged by the wire layer and simply
   *  retried on the next tick. */
  refreshWorkspaces: () => Promise<void>;
  setCurrent: (ws: Workspace) => void;
  create: (name: string) => Promise<Workspace>;
  /** Delete a team space for good (PRODUCT-1410). Optimistic (PRODUCT-1426):
   *  the row leaves the list and, when it was the active space, the store
   *  lands on the default space and re-pins the gateway BEFORE the server
   *  round-trip — the returned promise settles once the server confirms.
   *  Rejections restore the row in place and propagate (surfaced by the wire
   *  layer / the caller's `silence` predicate). */
  delete: (id: string, options?: EngineCallOptions) => Promise<void>;
  rename: (id: string, newName: string) => Promise<void>;
  /** Set (or clear, with null) the workspace's UI-locale override. */
  setLocale: (id: string, locale: string | null) => Promise<void>;
  /** Drop the workspace list back to its initial (loading) state on an identity
   *  change (HOU-903); the incoming account re-loads its own spaces on boot. */
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  current: null,
  // Start "not settled" so App.tsx renders the loading splash on first paint
  // instead of a first-run route. Returning users with an existing workspace
  // would otherwise briefly fall through the `workspaces.length === 0` gate
  // and enter the setup flow before `loadWorkspaces()` resolves, which marks
  // `onboarding_pending` and holds them there. The splash
  // reads `loaded` (never-loaded-yet), NOT `loading`: a retry or a refresh must
  // not swap the whole app for the splash and remount the shell under the user.
  loading: true,
  loaded: false,
  loadError: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      // Restore the last-selected space alongside the list. On a personal-only
      // host the persisted id resolves to the sole default workspace, so this
      // stays byte-identical to the old isDefault-then-first resolution.
      const [listed, lastId] = await Promise.all([
        tauriWorkspaces.list(),
        tauriPreferences.get("last_workspace_id"),
      ]);
      const workspaces = withoutPendingDeletes(listed, pendingWorkspaceDeletes);
      const current = resolveActiveWorkspace(workspaces, lastId);
      // Pin the active space (C8) BEFORE the first space-scoped fetches fire so
      // they carry the right x-houston-org from the start (no header for
      // personal). No cache reset here — nothing has been fetched yet.
      setActiveOrg(current ? orgSlugFromWorkspaceId(current.id) : null);
      set({ workspaces, current, loadError: false });
    } catch {
      // No reporting here: both awaited calls run through `call()`
      // (`lib/tauri.ts`), which already toasts the failure AND captures it to
      // Sentry. This catch only settles state — it records that the attempt
      // failed so a gated screen can offer a retry (SettingsView) instead of
      // spinning, and can tell "the load broke" from "there is nothing here".
      set({ loadError: true });
    } finally {
      set({ loading: false, loaded: true });
    }
  },

  refreshWorkspaces: async () => {
    const before = get();
    // Never race the boot load or a user-initiated reload; they own `loading`.
    if (!before.loaded || before.loading) return;
    let fresh: Workspace[];
    try {
      fresh = await tauriWorkspaces.listQuiet();
    } catch {
      return; // logged by the wire layer; the next tick retries
    }
    // Checked AFTER the fetch: a delete that started mid-flight must still win.
    fresh = withoutPendingDeletes(fresh, pendingWorkspaceDeletes);
    const prev = get();
    if (prev.loading) return; // a real load started mid-flight; it wins
    // The active space vanishing here means the user was removed from the team
    // while the app was open.
    applyRefreshPlan(
      planSpacesRefresh(prev.workspaces, prev.current, fresh),
      set,
    );
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

  delete: (id, options) => runWorkspaceDelete(id, options, get, set),

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
  // a stale list, until the incoming account's loadWorkspaces() resolves. The
  // outgoing account's in-flight deletes must not filter the incoming list.
  reset: () => {
    pendingWorkspaceDeletes.clear();
    set({ workspaces: [], current: null, loading: true });
  },
}));
