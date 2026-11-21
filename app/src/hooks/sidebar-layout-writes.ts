import type { SidebarLayout } from "@houston/engine-adapter";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";
import { normalizeSidebarLayout } from "../lib/sidebar-layout-ops";

export const sidebarLayoutWriteKey = (workspaceId: string) =>
  ["sidebar-layout-write", workspaceId] as const;

export type ReportLayoutError = (command: string, err: unknown) => void;

const reportedUnreadLayouts = new WeakMap<QueryClient, Set<string>>();

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

export function sidebarLayoutWriteOptions(
  qc: QueryClient,
  workspaceId: string,
  persist: (layout: SidebarLayout) => Promise<unknown>,
  report: ReportLayoutError,
  rolledBack?: (err: unknown) => void,
) {
  const key = queryKeys.sidebarLayout(workspaceId);
  return {
    mutationKey: sidebarLayoutWriteKey(workspaceId),
    scope: { id: `sidebar-layout:${workspaceId}` },
    mutationFn: (vars: LayoutWrite) => persist(vars.next),
    onSuccess: () => {
      rollbackBasesOf(qc).delete(workspaceId);
    },
    onError: (err: unknown, vars: LayoutWrite) => {
      const bases = rollbackBasesOf(qc);
      const base = bases.has(workspaceId) ? bases.get(workspaceId) : vars.prev;
      if (pendingWrites(qc, workspaceId) > 1) {
        bases.set(workspaceId, base);
        return;
      }
      bases.delete(workspaceId);
      if (base) qc.setQueryData(key, base);
      rolledBack?.(err);
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
