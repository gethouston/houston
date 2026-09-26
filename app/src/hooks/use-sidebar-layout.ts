import type { SidebarLayout, SidebarRootEntry } from "@houston/engine-adapter";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { logAndReportError } from "../lib/error-report";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import type { ItemDest } from "../lib/sidebar-layout-ops";
import {
  arrangeOp,
  createGroupWithIdentityOp,
  DEFAULT_SIDEBAR_LAYOUT,
  deleteGroupOp,
  moveItemOp,
  normalizeSidebarLayout,
  remapAgentIdOp,
  renameGroupOp,
  setGroupIdentityOp,
  toggleGroupCollapsedOp,
} from "../lib/sidebar-layout-ops";
import { tauriSidebar } from "../lib/tauri";
import {
  applySidebarLayoutOp,
  sidebarLayoutWriteOptions,
} from "./sidebar-layout-writes";

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

/**
 * Non-React twin of {@link useSidebarLayoutReady}: the layout read settled. A
 * refused read counts, as its normalized default order is still usable.
 */
export function isSidebarLayoutSettled(
  workspaceId: string | undefined,
): boolean {
  if (!workspaceId) return false;
  const status = queryClient.getQueryState(
    queryKeys.sidebarLayout(workspaceId),
  )?.status;
  return status === "success" || status === "error";
}

/** The one read of the layout. Its key is also the one optimistic writes
 *  target, so a read and a write can never key differently. */
function sidebarLayoutQuery(workspaceId: string | undefined) {
  return queryOptions({
    queryKey: workspaceId
      ? queryKeys.sidebarLayout(workspaceId)
      : (["sidebar-layout", "none"] as const),
    queryFn: () => tauriSidebar.getLayout(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

/**
 * The workspace's stored sidebar layout, read-only. What every consumer that
 * only READS it should use (the teams resolution, the command palette): none of
 * the optimistic mutation stack is built.
 *
 * Memoized on the cached value, not recomputed per render: consumers derive
 * memoized structures from it (the folders the sidebar and the employee screen
 * both resolve), and a fresh object every render would invalidate all of them.
 */
export function useSidebarLayoutValue(
  workspaceId: string | undefined,
): SidebarLayout {
  const query = useQuery(sidebarLayoutQuery(workspaceId));
  return useMemo(() => normalizeSidebarLayout(query.data), [query.data]);
}

export function useSidebarLayoutReady(
  workspaceId: string | undefined,
): boolean {
  const query = useQuery(sidebarLayoutQuery(workspaceId));
  // A refused read already reports through the adapter. Its normalized
  // default order is still a usable landing; waiting for success would hang.
  return !!workspaceId && (query.isSuccess || query.isError);
}

/** A successful document read, required before editing or rendering groups. */
export function useSidebarLayoutLoaded(
  workspaceId: string | undefined,
): boolean {
  const query = useQuery(sidebarLayoutQuery(workspaceId));
  return !!workspaceId && query.isSuccess;
}

export interface UseSidebarLayout {
  layout: SidebarLayout;
  ready: boolean;
  /** Create a group and return its new id (so the caller can focus its name). */
  createGroup: (
    name: string,
    identity?: { icon?: string; color?: string },
    before?: SidebarRootEntry | null,
  ) => string | null;
  renameGroup: (id: string, name: string) => void;
  remapAgentId: (oldId: string, newId: string) => void;
  /** Set a team's glyph + color: `null` CLEARS a field, a string sets it, an
   *  omitted field is untouched. */
  setGroupIdentity: (
    id: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  /** Reorder an agent or move it into or out of a folder. */
  moveItem: (agentId: string, dest: ItemDest) => void;
  /** Store a sidebar drop: the top-level order and every group's members.
   *  False when nothing was written (layout not loaded, or no change). */
  arrange: (arrangement: {
    order: SidebarRootEntry[];
    members: Record<string, string[]>;
  }) => boolean;
}

/**
 * The workspace's sidebar layout plus the helpers the sidebar drives it with.
 * Reads via TanStack Query; every helper computes the next layout immutably
 * from the freshest cached value and fires an OPTIMISTIC write so drag and
 * grouping feel instant. Ordering, refetch and rollback rules for overlapping
 * writes live in `sidebar-layout-writes.ts`; the `tauriSidebar` wrapper already
 * surfaces a failure through `call()`, so a rollback adds no second toast.
 *
 * Reading the layout and nothing else? Use {@link useSidebarLayoutValue}.
 */
export function useSidebarLayout(
  workspaceId: string | undefined,
): UseSidebarLayout {
  const qc = useQueryClient();

  const layout = useSidebarLayoutValue(workspaceId);
  const ready = useSidebarLayoutLoaded(workspaceId);

  const mutation = useMutation(
    sidebarLayoutWriteOptions(
      qc,
      workspaceId ?? "",
      (next) => tauriSidebar.setLayout(workspaceId as string, next),
      logAndReportError,
    ),
  );

  const apply = (op: (current: SidebarLayout) => SidebarLayout): boolean => {
    if (!workspaceId) return false;
    const write = applySidebarLayoutOp(qc, workspaceId, op, logAndReportError);
    if (!write) return false;
    mutation.mutate(write);
    return true;
  };

  return {
    layout,
    ready,
    createGroup: (name, identity, before) => {
      if (!workspaceId) return null;
      const id = `grp_${crypto.randomUUID()}`;
      const written = apply((c) =>
        createGroupWithIdentityOp(
          c,
          id,
          name,
          before === undefined ? (c.order[0] ?? null) : before,
          identity,
        ),
      );
      return written ? id : null;
    },
    renameGroup: (id, name) => apply((c) => renameGroupOp(c, id, name)),
    remapAgentId: (oldId, newId) =>
      apply((c) => remapAgentIdOp(c, oldId, newId)),
    setGroupIdentity: (id, patch) =>
      apply((c) => setGroupIdentityOp(c, id, patch)),
    deleteGroup: (id) => apply((c) => deleteGroupOp(c, id)),
    toggleGroupCollapsed: (id) => apply((c) => toggleGroupCollapsedOp(c, id)),
    moveItem: (agentId, dest) => apply((c) => moveItemOp(c, agentId, dest)),
    arrange: (arrangement) => apply((c) => arrangeOp(c, arrangement)),
  };
}
