import type { SidebarLayout } from "@houston/engine-adapter";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";
import { normalizeSidebarLayout } from "../lib/sidebar-layout-ops";

/**
 * Concurrent optimistic writes to ONE document, the pattern TanStack Query
 * documents for it. Every layout change writes the whole document, so a drag
 * followed quickly by another produces overlapping PUTs and refetches. Three
 * rules keep the screen on the person's latest arrangement:
 *
 * 1. Writes share a mutation `scope`, so they reach the server one at a time
 *    and in order: an older document can never land after a newer one.
 * 2. A refetch in flight is cancelled at the optimistic write, and no refetch
 *    (settled write or `SidebarLayoutChanged` event) starts while a write is
 *    still pending: its answer predates the pending document and would paint
 *    the previous arrangement back.
 * 3. Only the LAST pending write re-reads the server, once every write landed.
 * 4. A failed write rolls back only when it is the last one pending, and then to
 *    the state before the OLDEST write that failed since the last success: each
 *    later write was computed on top of the earlier failures.
 */

export const sidebarLayoutWriteKey = (workspaceId: string) =>
  ["sidebar-layout-write", workspaceId] as const;

/** Reports a failure that has no user-facing consequence (`logAndReportError`). */
export type ReportLayoutError = (command: string, err: unknown) => void;

const reportedUnreadLayouts = new WeakMap<QueryClient, Set<string>>();

/** Per workspace: the layout before the oldest write failed since a success. */
const rollbackBases = new WeakMap<
  QueryClient,
  Map<string, SidebarLayout | undefined>
>();

function rollbackBasesOf(qc: QueryClient) {
  let bases = rollbackBases.get(qc);
  if (!bases) {
    bases = new Map();
    rollbackBases.set(qc, bases);
  }
  return bases;
}

interface LayoutWrite {
  next: SidebarLayout;
  prev: SidebarLayout | undefined;
}

const pendingWrites = (qc: QueryClient, workspaceId: string) =>
  qc.isMutating({ mutationKey: sidebarLayoutWriteKey(workspaceId) });

/** The mutation options for one workspace's layout writes. */
export function sidebarLayoutWriteOptions(
  qc: QueryClient,
  workspaceId: string,
  persist: (layout: SidebarLayout) => Promise<unknown>,
  report: ReportLayoutError,
) {
  const key = queryKeys.sidebarLayout(workspaceId);
  return {
    mutationKey: sidebarLayoutWriteKey(workspaceId),
    scope: { id: `sidebar-layout:${workspaceId}` },
    mutationFn: (vars: LayoutWrite) => persist(vars.next),
    onSuccess: () => {
      rollbackBasesOf(qc).delete(workspaceId);
    },
    onError: (_err: unknown, vars: LayoutWrite) => {
      const bases = rollbackBasesOf(qc);
      const base = bases.has(workspaceId) ? bases.get(workspaceId) : vars.prev;
      if (pendingWrites(qc, workspaceId) > 1) {
        bases.set(workspaceId, base);
        return;
      }
      bases.delete(workspaceId);
      if (base) qc.setQueryData(key, base);
    },
    onSettled: () => {
      if (pendingWrites(qc, workspaceId) === 1) {
        qc.invalidateQueries({ queryKey: key }).catch((err: unknown) =>
          report("sidebar_layout_refetch", err),
        );
      }
    },
  };
}

/**
 * Apply a pure op to the freshest cached layout and write the result into the
 * cache in the same tick, so a second op issued back to back composes on this
 * one. Returns the write to persist, or null when there is nothing to write:
 * the layout is not loaded yet, or the op changed nothing (it returned the
 * layout it was given).
 */
export function applySidebarLayoutOp(
  qc: QueryClient,
  workspaceId: string,
  op: (current: SidebarLayout) => SidebarLayout,
  report: ReportLayoutError,
): LayoutWrite | null {
  const key = queryKeys.sidebarLayout(workspaceId);
  const prev = qc.getQueryData<SidebarLayout>(key);
  if (prev === undefined || qc.getQueryState(key)?.status !== "success") {
    let reported = reportedUnreadLayouts.get(qc);
    if (!reported) {
      reported = new Set();
      reportedUnreadLayouts.set(qc, reported);
    }
    if (!reported.has(workspaceId)) {
      reported.add(workspaceId);
      report(
        "sidebar_layout_not_ready",
        new Error("Sidebar layout is not loaded"),
      );
    }
    return null;
  }
  reportedUnreadLayouts.get(qc)?.delete(workspaceId);
  const current = normalizeSidebarLayout(prev);
  const next = op(current);
  if (next === current) return null;
  qc.cancelQueries({ queryKey: key }).catch((err: unknown) =>
    report("sidebar_layout_cancel_refetch", err),
  );
  qc.setQueryData<SidebarLayout>(key, next);
  return { next, prev };
}

/**
 * Whether an invalidation of `queryKey` must wait: it is a sidebar layout with
 * a write still pending, whose own settle re-reads the server afterwards.
 */
export function sidebarLayoutRefetchDeferred(
  qc: QueryClient,
  queryKey: QueryKey,
): boolean {
  const [root, workspaceId] = queryKey;
  return (
    root === queryKeys.sidebarLayout("")[0] &&
    typeof workspaceId === "string" &&
    pendingWrites(qc, workspaceId) > 0
  );
}
