/**
 * Pure helpers for partitioning missions by archived state and for the
 * bulk "move to" targets. No engine / React imports so it stays unit-
 * testable and reusable from both the board tab and the archived tab.
 */

import { isSetupChatMode } from "./integration-chat-setup.ts";

/** The status that hides a mission from the active board and surfaces it in
 *  the Archived missions tab. Matches `activity.schema.json`. */
export const ARCHIVED_STATUS = "archived";

/** The status of a mission the user has signed off on. Only the user ever puts
 *  a mission here: the engine settles finished work into `needs_you` (or
 *  `error`) and waits, so every write of this status is a deliberate act. */
export const DONE_STATUS = "done";

/** The status a mission ends in when its turn genuinely failed. It shares the
 *  Needs you column with `needs_you`, so it reaches every "move to done" path —
 *  but closing a failed mission is housekeeping, never a win. */
export const ERROR_STATUS = "error";

/**
 * True when moving the missions currently in `fromStatuses` to `targetStatus`
 * earns the confetti payoff. Two conditions, both required:
 *
 *  - the move lands on Done (the only transition worth celebrating), and
 *  - at least one of the moved missions actually succeeded — checking off a
 *    mission that ended in `error` is filing a failure away, and a celebration
 *    there reads as the product cheering for a mission that broke.
 *
 * A mixed batch celebrates ONCE, for the missions that did land: the bulk bar
 * moves the whole selection in one act, so one nod for the batch is the honest
 * response (silencing it because one card failed would rob the rest).
 *
 * Named once here so the card checkmark, the drag-to-column drop and the bulk
 * "Move to" all agree on what counts as finishing a mission.
 */
export function celebratesMissionDone(
  targetStatus: string,
  fromStatuses: readonly string[],
): boolean {
  return (
    targetStatus === DONE_STATUS &&
    fromStatuses.some((status) => status !== ERROR_STATUS)
  );
}

/** Statuses a multi-selection can be moved to from the bulk action bar.
 *  Deliberately excludes `running` (you don't manually "move" a mission
 *  into running — sending a message does that) and `error`/`archived`. */
export const BULK_MOVE_TARGETS = [DONE_STATUS, "needs_you"] as const;
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
  /** Agent-mode id; a guided-setup sentinel hides the mission entirely. */
  agent?: string | null;
}

/** Missions shown on the active board (not archived, not a guided-setup
 *  chat — the routine / custom-integration chats live in their own surface,
 *  never as a card). */
export function selectActive<T extends SelectableMission>(items: T[]): T[] {
  return items.filter(
    (item) => !isArchived(item) && !isSetupChatMode(item.agent),
  );
}

/** Missions shown in the Archived missions tab. Closed guided-setup chats
 *  stay out of here too: they were never a mission the user managed. */
export function selectArchived<T extends SelectableMission>(items: T[]): T[] {
  return items.filter(
    (item) => isArchived(item) && !isSetupChatMode(item.agent),
  );
}
