import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { type EngineCallOptions, tauriWorkspaces } from "../lib/tauri";
import type { Workspace } from "../lib/types";
import { restoreSpaceRow } from "../lib/workspace-delete-model";
import { planSpacesRefresh } from "../lib/workspace-refresh";
import { applyRefreshPlan } from "./workspace-refresh-apply";

/**
 * Team-space delete in two shapes (PRODUCT-1426, refining PRODUCT-1410).
 *
 * `optimistic` — for a delete the caller has pre-checked the gateway will
 * accept (`canDeleteOptimistically`): the gateway can take seconds to destroy
 * a space, and waiting for it left the user sitting inside a "deleted"
 * workspace with no feedback. So the store switches FIRST — the row leaves the
 * list and, when it was the active space, the user lands on the default space
 * with the gateway re-pinned — and the server call runs behind that switch.
 * PRODUCT-1410's lesson (an optimistic drop over a no-op stub faked success
 * forever) still holds, differently: the delete is a real server call whose
 * rejection is LOUD — the row is restored in place and the error propagates to
 * the caller's toast. A silent failure can't stick either way: the live-spaces
 * poll re-lists whatever the server still has.
 *
 * `server-first` — the PRODUCT-1410 posture, for a delete the pre-check could
 * NOT prove acceptable (teammates remain, a live subscription, or the check
 * itself failed): the row leaves the store only once the space is really gone,
 * so the user is never shown a success that the gateway then takes back.
 */
export type WorkspaceDeleteMode = "optimistic" | "server-first";

/**
 * Space ids whose server delete is still in flight. Until the server confirms,
 * it still lists the space, so every re-list must drop these rows or the 60s
 * poll / a window focus would resurrect an optimistically-deleted space.
 */
export const pendingWorkspaceDeletes = new Set<string>();

interface SpacesSlice {
  workspaces: Workspace[];
  current: Workspace | null;
}

type SpacesSetter = (patch: {
  workspaces: Workspace[];
  current?: Workspace | null;
}) => void;

// Same merge as a live refresh that no longer lists the space: dropping the
// active one is a `reselect`, which lands on the default space AND re-pins
// the gateway + resets the space-scoped caches — dropping the row without
// re-pinning would leave every request addressed to a space that 404s.
function dropRow(id: string, get: () => SpacesSlice, set: SpacesSetter): void {
  const prev = get();
  applyRefreshPlan(
    planSpacesRefresh(
      prev.workspaces,
      prev.current,
      prev.workspaces.filter((w) => w.id !== id),
    ),
    set,
  );
}

export async function runWorkspaceDelete(
  id: string,
  options: EngineCallOptions | undefined,
  get: () => SpacesSlice,
  set: SpacesSetter,
  mode: WorkspaceDeleteMode,
): Promise<void> {
  if (mode === "server-first") {
    await tauriWorkspaces.delete(id, options);
    dropRow(id, get, set);
    queryClient.invalidateQueries({ queryKey: queryKeys.orgs() });
    return;
  }
  const prev = get();
  const index = prev.workspaces.findIndex((w) => w.id === id);
  const target = index === -1 ? undefined : prev.workspaces[index];
  pendingWorkspaceDeletes.add(id);
  dropRow(id, get, set);
  try {
    await tauriWorkspaces.delete(id, options);
    queryClient.invalidateQueries({ queryKey: queryKeys.orgs() });
  } catch (err) {
    if (target) {
      set({ workspaces: restoreSpaceRow(get().workspaces, target, index) });
    }
    throw err;
  } finally {
    pendingWorkspaceDeletes.delete(id);
  }
}
