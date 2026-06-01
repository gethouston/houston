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
