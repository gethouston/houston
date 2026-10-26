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
  /** Delete a team space for good (PRODUCT-1410). Defaults to `server-first`
   *  (the row leaves the list only once the space is really gone); a caller
   *  that pre-checked the gateway will accept (`canDeleteOptimistically`)
   *  passes `optimistic` to switch away BEFORE the server round-trip, with the
   *  row restored in place on rejection (PRODUCT-1426). Rejections propagate
   *  either way (surfaced by the wire layer / the caller's `silence`
   *  predicate). */
  delete: (
    id: string,
    options?: EngineCallOptions,
    mode?: WorkspaceDeleteMode,
  ) => Promise<void>;
  /** Set (or clear, with null) the workspace's UI-locale override.
   *  Optimistic and sequenced per workspace (`workspace-locale-writes.ts`):
   *  only the newest pick swaps in or rolls back, and its refusal rejects. */
  setLocale: (id: string, locale: string | null) => Promise<LocaleWriteOutcome>;
  /** Drop the workspace list back to its initial (loading) state on an identity
   *  change (HOU-903); the incoming account re-loads its own spaces on boot. */
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
  // Only the first load shows the boot splash; later reloads keep the shell.
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
        // Pin boot requests before the first space-scoped fetch.
        setActiveOrg(current ? orgSlugFromWorkspaceId(current.id) : null);
        set({ workspaces, current, loadError: false });
      }
    } catch {
      // The list and SDK preference reporter already report their failures.
      if (generation === loadGeneration) set({ loadError: true });
    } finally {
      if (generation === loadGeneration) set({ loading: false, loaded: true });
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
    void tauriPreferences.set("last_workspace_id", ws.id).catch((err) => {
      reportWorkspacePreferenceError("write", err);
    });
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

  delete: (id, options, mode = "server-first") =>
    runWorkspaceDelete(id, options, get, set, mode),

  // Mirrors the initial state (loading: true) so the shell shows its splash, not
  // a stale list, until the incoming account's loadWorkspaces() resolves. The
  // outgoing account's in-flight deletes must not filter the incoming list.
  reset: () => {
    loadGeneration++;
    pendingWorkspaceDeletes.clear();
    set({ workspaces: [], current: null, loading: true });
  },
}));
