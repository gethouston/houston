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
import { tellSidebarLayoutRefused } from "./sidebar-layout-refusal";
import {
  applySidebarLayoutOp,
  sidebarLayoutWriteOptions,
} from "./sidebar-layout-writes";

export function getCurrentSidebarLayout(
  workspaceId: string | undefined,
): SidebarLayout {
  if (!workspaceId) return DEFAULT_SIDEBAR_LAYOUT;
  return normalizeSidebarLayout(
    queryClient.getQueryData(queryKeys.sidebarLayout(workspaceId)),
  );
}

export function isSidebarLayoutSettled(
  workspaceId: string | undefined,
): boolean {
  if (!workspaceId) return false;
  const status = queryClient.getQueryState(
    queryKeys.sidebarLayout(workspaceId),
  )?.status;
  return status === "success" || status === "error";
}

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
  return !!workspaceId && (query.isSuccess || query.isError);
}

export function useSidebarLayoutLoaded(
  workspaceId: string | undefined,
): boolean {
  const query = useQuery(sidebarLayoutQuery(workspaceId));
  return !!workspaceId && query.isSuccess;
}

export interface UseSidebarLayout {
  layout: SidebarLayout;
  ready: boolean;
  createGroup: (
    name: string,
    identity?: { icon?: string; color?: string },
    before?: SidebarRootEntry | null,
  ) => string | null;
  renameGroup: (id: string, name: string) => void;
  remapAgentId: (oldId: string, newId: string) => void;
  setGroupIdentity: (
    id: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
  deleteGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  moveItem: (agentId: string, dest: ItemDest) => void;
  arrange: (arrangement: {
    order: SidebarRootEntry[];
    members: Record<string, string[]>;
  }) => boolean;
}

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
      tellSidebarLayoutRefused,
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
