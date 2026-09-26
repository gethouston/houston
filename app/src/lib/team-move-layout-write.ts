import type { SidebarLayout } from "@houston/engine-adapter";
import type { QueryClient } from "@tanstack/react-query";
import {
  applySidebarLayoutOp,
  type ReportLayoutError,
  sidebarLayoutWriteOptions,
} from "../hooks/sidebar-layout-writes.ts";

export async function writeTeamMoveLayout(
  qc: QueryClient,
  workspaceId: string,
  op: (layout: SidebarLayout) => SidebarLayout,
  persist: (layout: SidebarLayout) => Promise<unknown>,
  report: ReportLayoutError,
): Promise<SidebarLayout> {
  const options = sidebarLayoutWriteOptions(qc, workspaceId, persist, report);
  const write = applySidebarLayoutOp(qc, workspaceId, op, report);
  if (!write) throw new Error("sidebar layout is not ready for folder move");
  await qc.getMutationCache().build(qc, options).execute(write);
  return write.next;
}
