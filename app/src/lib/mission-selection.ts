export const ARCHIVED_STATUS = "archived";

export const RUNNING_STATUS = "running";

export const DONE_STATUS = "done";

export const ERROR_STATUS = "error";

export function celebratesMissionDone(
  targetStatus: string,
  fromStatuses: readonly string[],
): boolean {
  return (
    targetStatus === DONE_STATUS &&
    fromStatuses.some((status) => status !== ERROR_STATUS)
  );
}

export const BULK_MOVE_TARGETS = [DONE_STATUS, "needs_you"] as const;
export type BulkMoveTarget = (typeof BULK_MOVE_TARGETS)[number];

export function moveTargetsForSection(
  sectionColumnId: string | null,
): BulkMoveTarget[] {
  return BULK_MOVE_TARGETS.filter((status) => status !== sectionColumnId);
}

export function canDropMission(
  fromColumnId: string | null,
  toColumnId: string,
): boolean {
  return (
    (BULK_MOVE_TARGETS as readonly string[]).includes(toColumnId) &&
    toColumnId !== fromColumnId
  );
}

export function selectAllIds(
  selected: ReadonlySet<string>,
  ids: string[],
): Set<string> {
  const next = new Set(selected);
  for (const id of ids) next.add(id);
  return next;
}
