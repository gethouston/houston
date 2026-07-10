import type { SidebarLayout } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import type { ItemDest } from "../lib/sidebar-layout-ops";
import {
  createGroupOp,
  DEFAULT_SIDEBAR_LAYOUT,
  deleteGroupOp,
  moveGroupOp,
  moveItemOp,
  normalizeSidebarLayout,
  renameGroupOp,
  setGroupContextOp,
  toggleGroupCollapsedOp,
} from "../lib/sidebar-layout-ops";
import { tauriSidebar } from "../lib/tauri";

/**
 * Non-React read of the current sidebar layout from the shared query cache, for
 * keyboard shortcuts and the command palette (they run outside the React tree).
 * Falls back to the default when the workspace has no cached layout yet.
 */
export function getCurrentSidebarLayout(
  workspaceId: string | undefined,
): SidebarLayout {
  if (!workspaceId) return DEFAULT_SIDEBAR_LAYOUT;
  return normalizeSidebarLayout(
    queryClient.getQueryData(queryKeys.sidebarLayout(workspaceId)),
  );
}

export interface UseSidebarLayout {
  layout: SidebarLayout;
  /** Create a group and return its new id (so the caller can focus its name). */
  createGroup: (name: string) => string | null;
  renameGroup: (id: string, name: string) => void;
  setGroupContext: (id: string, context: string) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  moveItem: (agentId: string, dest: ItemDest) => void;
  moveGroup: (groupId: string, beforeGroupId: string | null) => void;
}

/**
 * The workspace's sidebar layout plus the helpers the sidebar drives it with.
 * Reads via TanStack Query; every helper computes the next layout immutably
 * from the freshest cached value and fires an OPTIMISTIC mutation so drag /
 * grouping feels instant, rolling back on error (the `tauriSidebar` wrapper
 * already surfaces the failure through `call()`, so `onError` only restores the
 * previous cache value — no double toast).
 */
export function useSidebarLayout(
  workspaceId: string | undefined,
): UseSidebarLayout {
  const qc = useQueryClient();

  const key = workspaceId
    ? queryKeys.sidebarLayout(workspaceId)
    : (["sidebar-layout", "none"] as const);

  const query = useQuery({
    queryKey: key,
    queryFn: () => tauriSidebar.getLayout(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (next: SidebarLayout) =>
      tauriSidebar.setLayout(workspaceId as string, next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SidebarLayout>(key);
      qc.setQueryData<SidebarLayout>(key, next);
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const layout = normalizeSidebarLayout(query.data);

  /** Apply a pure op to the FRESHEST cached layout, then mutate. Reading the
   *  cache (not the closed-over `layout`) keeps overlapping drags composing. */
  const apply = (op: (current: SidebarLayout) => SidebarLayout) => {
    if (!workspaceId) return;
    const current = normalizeSidebarLayout(qc.getQueryData(key));
    mutation.mutate(op(current));
  };

  return {
    layout,
    createGroup: (name) => {
      if (!workspaceId) return null;
      const id = `grp_${crypto.randomUUID()}`;
      apply((c) => createGroupOp(c, id, name));
      return id;
    },
    renameGroup: (id, name) => apply((c) => renameGroupOp(c, id, name)),
    setGroupContext: (id, context) =>
      apply((c) => setGroupContextOp(c, id, context)),
    deleteGroup: (id) => apply((c) => deleteGroupOp(c, id)),
    toggleGroupCollapsed: (id) => apply((c) => toggleGroupCollapsedOp(c, id)),
    moveItem: (agentId, dest) => apply((c) => moveItemOp(c, agentId, dest)),
    moveGroup: (groupId, beforeGroupId) =>
      apply((c) => moveGroupOp(c, groupId, beforeGroupId)),
  };
}
