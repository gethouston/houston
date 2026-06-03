/**
 * Pure helpers for partitioning missions by archived state and for the
 * bulk "move to" targets. No engine / React imports so it stays unit-
 * testable and reusable from both the board tab and the archived tab.
 */

/** The status that hides a mission from the active board and surfaces it in
 *  the Archived missions tab. Matches `activity.schema.json`. */
export const ARCHIVED_STATUS = "archived";

/** Statuses a multi-selection can be moved to from the bulk action bar.
 *  Deliberately excludes `running` (you don't manually "move" a mission
 *  into running — sending a message does that) and `error`/`archived`. */
export const BULK_MOVE_TARGETS = ["done", "needs_you"] as const;
export type BulkMoveTarget = (typeof BULK_MOVE_TARGETS)[number];

/**
 * Bulk move targets available for a selection locked to `sectionColumnId`
 * (the board column id the selected cards live in). A selection can't move
 * to the section it's already in, so that target is dropped — e.g. cards in
 * `needs_you` only offer "done", cards in `done` only offer "needs_you", and
 * `running` cards offer both. `null` (no active section) offers both.
 */
export function moveTargetsForSection(
  sectionColumnId: string | null,
): BulkMoveTarget[] {
  return BULK_MOVE_TARGETS.filter((status) => status !== sectionColumnId);
}

/**
 * Drag-and-drop eligibility for a single mission card: can a mission currently
 * in board section `fromColumnId` be dropped on `toColumnId`? Mirrors the bulk-
 * move rule exactly — only the bulk move targets (`done` / `needs_you`) accept
 * a drop, `running` never does, and a card can't be dropped on the section it
 * already lives in (a no-op). Because the bulk move targets are also valid
 * activity statuses whose names equal their column ids, `toColumnId` doubles as
 * the resulting status for the move.
 */
export function canDropMission(
  fromColumnId: string | null,
  toColumnId: string,
): boolean {
  return (
    (BULK_MOVE_TARGETS as readonly string[]).includes(toColumnId) &&
    toColumnId !== fromColumnId
  );
}

/** True when every id in `ids` is selected (and `ids` is non-empty). Drives the
 *  "select all" checkbox state for a section. */
export function areAllSelected(
  ids: string[],
  selected: ReadonlySet<string>,
): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** Toggle a group of ids as one: if all are already selected, remove them all;
 *  otherwise add them all. Returns a new Set (never mutates the input). */
export function toggleAllIds(
  selected: ReadonlySet<string>,
  ids: string[],
): Set<string> {
  const next = new Set(selected);
  const all = areAllSelected(ids, selected);
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function isArchived<T extends { status: string }>(item: T): boolean {
  return item.status === ARCHIVED_STATUS;
}

/** Missions shown on the active board (everything not archived). */
export function selectActive<T extends { status: string }>(items: T[]): T[] {
  return items.filter((item) => !isArchived(item));
}

/** Missions shown in the Archived missions tab. */
export function selectArchived<T extends { status: string }>(items: T[]): T[] {
  return items.filter(isArchived);
}
