import { ARCHIVED_STATUS } from "./mission-selection.ts";

export type BoardSurface = "active" | "archived";

export interface SurfaceRow {
  id: string;
  status?: string | null;
}

export function pendingMissionSurface(
  rows: readonly SurfaceRow[] | undefined,
  pendingId: string | null,
): BoardSurface | null {
  if (!pendingId) return null;
  const row = rows?.find((r) => r.id === pendingId);
  return row?.status === ARCHIVED_STATUS ? "archived" : "active";
}

export function surfaceOnActivate(pending: BoardSurface | null): BoardSurface {
  return pending ?? "active";
}
