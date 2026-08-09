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
  type ExpandOnlyTeam,
  expandOnlyTeamOp,
  moveGroupOp,
  moveItemOp,
  normalizeSidebarLayout,
  remapAgentIdOp,
  renameGroupOp,
  setDefaultContextOp,
  setGroupContextOp,
  setGroupIdentityOp,
  toggleDefaultCollapsedOp,
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
  /** Set a team's glyph + color: `null` CLEARS a field, a string sets it, an
   *  omitted field is untouched. */
  setGroupIdentity: (
    id: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  /** Fold/unfold the DEFAULT team block, which owns no group row to hold the
   *  flag (it is the workspace itself); absent reads as expanded. */
  toggleDefaultCollapsed: () => void;
  /** The rail's accordion: leave one team open and fold every other, as ONE
   *  write. See {@link expandOnlyTeamOp} for why it cannot be N toggles. */
  expandOnlyTeam: (args: ExpandOnlyTeam) => void;
  /** Set the DEFAULT team's shared context — `setGroupContext` for the team
   *  that owns no group row, optimistic in exactly the same way. */
  setDefaultContext: (context: string) => void;
  /** Reorder an agent WITHIN its own team. A drag cannot move an agent between
   *  teams any more, so `dest.groupId` is always the team it was already in. */
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
    mutationFn: (vars: { next: SidebarLayout; prev?: SidebarLayout }) =>
      tauriSidebar.setLayout(workspaceId as string, vars.next),
    onMutate: async () => {
      // The optimistic cache write already happened, SYNCHRONOUSLY, inside
      // `apply` — it cannot live here. `onMutate` runs behind an await
      // (`cancelQueries` is a microtask), so two applies issued in the same
      // tick would BOTH read the pre-write cache and the second would persist
      // a layout computed without the first's change. That is exactly how
      // "create team → stamp its identity" once wrote the new group and then
      // clobbered it with an empty layout, silently losing the user's team.
      await qc.cancelQueries({ queryKey: key });
    },
    onError: (_err, vars) => {
      if (vars.prev) qc.setQueryData(key, vars.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  /** Apply a pure op to the FRESHEST cached layout, write the result into the
   *  cache IN THE SAME TICK, then persist. The synchronous cache write is the
   *  whole composition guarantee: the next `apply` — even one issued
   *  back-to-back in the same handler — reads this one's result. */
  const apply = (op: (current: SidebarLayout) => SidebarLayout): void => {
    if (!workspaceId) return;
    const prev = qc.getQueryData<SidebarLayout>(key);
    const computed = op(normalizeSidebarLayout(prev));
    const next = normalize ? normalize(computed) : computed;
    qc.setQueryData<SidebarLayout>(key, next);
    mutation.mutate({ next, prev });
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
    setGroupIdentity: (id, patch) =>
      apply((c) => setGroupIdentityOp(c, id, patch)),
    deleteGroup: (id) => apply((c) => deleteGroupOp(c, id)),
    toggleGroupCollapsed: (id) => apply((c) => toggleGroupCollapsedOp(c, id)),
    toggleDefaultCollapsed: () => apply((c) => toggleDefaultCollapsedOp(c)),
    expandOnlyTeam: (args) => apply((c) => expandOnlyTeamOp(c, args)),
    setDefaultContext: (context) =>
      apply((c) => setDefaultContextOp(c, context)),
    moveItem: (agentId, dest) => apply((c) => moveItemOp(c, agentId, dest)),
    moveGroup: (groupId, beforeGroupId) =>
      apply((c) => moveGroupOp(c, groupId, beforeGroupId)),
  };
}
