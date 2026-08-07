import type { SidebarLayout } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
  remapAgentIdOp,
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

/** The query key the layout is read from and optimistically written to. One
 *  helper for both so a read and a write can never key differently. */
function layoutQueryKey(workspaceId: string | undefined) {
  return workspaceId
    ? queryKeys.sidebarLayout(workspaceId)
    : (["sidebar-layout", "none"] as const);
}

/**
 * The workspace's stored sidebar layout, read-only. What every consumer that
 * only READS it should use (the teams resolution, the command palette): none of
 * the optimistic mutation stack is built.
 *
 * Memoized on the cached value, not recomputed per render: consumers derive
 * memoized structures from it (the teams the sidebar and the team view both
 * resolve), and a fresh object every render would invalidate all of them.
 */
export function useSidebarLayoutValue(
  workspaceId: string | undefined,
): SidebarLayout {
  const query = useQuery({
    queryKey: layoutQueryKey(workspaceId),
    queryFn: () => tauriSidebar.getLayout(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
  return useMemo(() => normalizeSidebarLayout(query.data), [query.data]);
}

export interface UseSidebarLayout {
  layout: SidebarLayout;
  /** Create a group and return its new id (so the caller can focus its name). */
  createGroup: (name: string) => string | null;
  renameGroup: (id: string, name: string) => void;
  remapAgentId: (oldId: string, newId: string) => void;
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
 *
 * Reading the layout and nothing else? Use {@link useSidebarLayoutValue}.
 */
export function useSidebarLayout(
  workspaceId: string | undefined,
): UseSidebarLayout {
  const qc = useQueryClient();

  const key = layoutQueryKey(workspaceId);
  const layout = useSidebarLayoutValue(workspaceId);

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
    remapAgentId: (oldId, newId) =>
      apply((c) => remapAgentIdOp(c, oldId, newId)),
    setGroupContext: (id, context) =>
      apply((c) => setGroupContextOp(c, id, context)),
    deleteGroup: (id) => apply((c) => deleteGroupOp(c, id)),
    toggleGroupCollapsed: (id) => apply((c) => toggleGroupCollapsedOp(c, id)),
    moveItem: (agentId, dest) => apply((c) => moveItemOp(c, agentId, dest)),
    moveGroup: (groupId, beforeGroupId) =>
      apply((c) => moveGroupOp(c, groupId, beforeGroupId)),
  };
}
