/**
 * Pure helpers for partitioning missions by archived state and for the
 * bulk "move to" targets. No engine / React imports so it stays unit-
 * testable and reusable from both the board tab and the archived tab.
 */

import { isRoutineSetupMode } from "./routine-chat-setup.ts";

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

/** Add every id in `ids` to the selection (the column header "Select all in
 *  column"). Returns a new Set (never mutates the input) and is idempotent —
 *  ids already selected stay selected, so the menu item can be clicked
 *  repeatedly without toggling anything back off. Deselecting is the bulk
 *  bar's "Clear" / per-card checkboxes, never this entry point. */
export function selectAllIds(
  selected: ReadonlySet<string>,
  ids: string[],
): Set<string> {
  const next = new Set(selected);
  for (const id of ids) next.add(id);
  return next;
}

export function isArchived<T extends { status: string }>(item: T): boolean {
  return item.status === ARCHIVED_STATUS;
}

interface SelectableMission {
  status: string;
  /** Agent-mode id; the routine-setup sentinel hides the mission entirely. */
  agent?: string | null;
}

/** Missions shown on the active board (not archived, not a routine-setup
 *  chat — that guided chat lives in the Routines tab, never as a card). */
export function selectActive<T extends SelectableMission>(items: T[]): T[] {
  return items.filter(
    (item) => !isArchived(item) && !isRoutineSetupMode(item.agent),
  );
}

/** Missions shown in the Archived missions tab. Closed routine-setup chats
 *  stay out of here too: they were never a mission the user managed. */
export function selectArchived<T extends SelectableMission>(items: T[]): T[] {
  return items.filter(
    (item) => isArchived(item) && !isRoutineSetupMode(item.agent),
  );
}
