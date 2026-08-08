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
  /**
   * The seam every helper above is built on, exposed for the ONE caller that
   * needs more than they offer: apply a pure op to the FRESHEST cached layout,
   * persist the result, and hand back the layout it REPLACED (`undefined` when
   * there is no workspace and nothing was written).
   *
   * `normalizeWith` overrides the ambient normalizer for this one write, and
   * `null` writes the op's output verbatim. Both halves exist for a CROSS-TEAM
   * drop (`use-server-team-actions.ts`): it must be pruned against the roster
   * the move ASSERTS rather than the one still cached, and it must be
   * restorable byte-for-byte when the gateway refuses that move.
   */
  applyOp: (
    op: (current: SidebarLayout) => SidebarLayout,
    normalizeWith?: ((next: SidebarLayout) => SidebarLayout) | null,
  ) => SidebarLayout | undefined;
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
  /**
   * Last pass over the layout an op produced, applied right before it is
   * PERSISTED. Absent — the LOCAL backend — the op's output is written verbatim,
   * which is what keeps that path byte-identical.
   *
   * A server-teams host (C13) passes `normalizeTeamOverlay`: there the layout is
   * a per-user ordering OVERLAY keyed by server team id, so entries naming a
   * team that no longer exists, or an agent it no longer holds, decay on the
   * next write instead of accumulating forever. It belongs at THIS seam and not
   * at a call site because every overlay write goes through here, including the
   * collapse toggle the sidebar wires straight to `toggleGroupCollapsed`.
   */
  normalize?: (next: SidebarLayout) => SidebarLayout,
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

  /** Apply a pure op to the FRESHEST cached layout, then mutate; return the
   *  layout it replaced. Reading the cache (not the closed-over `layout`) keeps
   *  overlapping drags composing. `normalizeWith` defaults to the ambient
   *  normalizer and `null` opts out of it entirely. */
  const apply = (
    op: (current: SidebarLayout) => SidebarLayout,
    normalizeWith:
      | ((next: SidebarLayout) => SidebarLayout)
      | null
      | undefined = normalize,
  ): SidebarLayout | undefined => {
    if (!workspaceId) return undefined;
    const current = normalizeSidebarLayout(qc.getQueryData(key));
    const next = op(current);
    mutation.mutate(normalizeWith ? normalizeWith(next) : next);
    return current;
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
    applyOp: apply,
    moveItem: (agentId, dest) => apply((c) => moveItemOp(c, agentId, dest)),
    moveGroup: (groupId, beforeGroupId) =>
      apply((c) => moveGroupOp(c, groupId, beforeGroupId)),
  };
}
