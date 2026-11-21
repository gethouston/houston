import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { type EngineCallOptions, tauriWorkspaces } from "../lib/tauri";
import type { Workspace } from "../lib/types";
import { restoreSpaceRow } from "../lib/workspace-delete-model";
import { planSpacesRefresh } from "../lib/workspace-refresh";
import { applyRefreshPlan } from "./workspace-refresh-apply";

export type WorkspaceDeleteMode = "optimistic" | "server-first";

export const pendingWorkspaceDeletes = new Set<string>();

interface SpacesSlice {
  workspaces: Workspace[];
  current: Workspace | null;
}

type SpacesSetter = (patch: {
  workspaces: Workspace[];
  current?: Workspace | null;
}) => void;

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
