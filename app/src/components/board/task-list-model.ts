import type { KanbanItem } from "@houston-ai/board";
import { missionColumnIdForStatus } from "../mission-board-columns.ts";

/**
 * The phone task list's shared rules: the segmented control's positions, the
 * bands a list draws, and how board items fall into them. Pure, so
 * `app/tests/task-list-model.test.ts` pins them without rendering.
 *
 * One model for both phone lists (an agent's, a team's) because a task must
 * sit in the same band on either screen — and in the same section as the
 * column it occupies on the desktop board, which is why the split goes through
 * the board's own `missionColumnIdForStatus`.
 */

/** The segmented control's positions. "all" is the resting one. */
export type TaskListFilterId = "all" | "needs_you" | "running" | "done";

/** Render order, and the order the segments are drawn in. */
export const TASK_LIST_FILTER_IDS = [
  "all",
  "needs_you",
  "running",
  "done",
] as const satisfies readonly TaskListFilterId[];

/** The bands a list body draws, in order. The archive is NOT one of them: it
 *  is its own collapsed drawer at the bottom of the unfiltered list. */
export type TaskListSectionId = "needsYou" | "running" | "done";

export const TASK_LIST_SECTION_ORDER = [
  "needsYou",
  "running",
  "done",
] as const satisfies readonly TaskListSectionId[];

const SECTION_FOR_FILTER: Record<
  Exclude<TaskListFilterId, "all">,
  TaskListSectionId
> = { needs_you: "needsYou", running: "running", done: "done" };

/** The sections a segment leaves standing: one, or all three under "All". */
export function taskListSectionsFor(
  filter: TaskListFilterId,
): readonly TaskListSectionId[] {
  return filter === "all"
    ? TASK_LIST_SECTION_ORDER
    : [SECTION_FOR_FILTER[filter]];
}

const SECTION_FOR_COLUMN: Record<string, TaskListSectionId> = {
  needs_you: "needsYou",
  running: "running",
  done: "done",
};

/** The band a board item belongs to, or null when no column claims its status
 *  (an archived mission, which never appears on the active board). */
export function taskListSectionForItem(
  item: KanbanItem,
): TaskListSectionId | null {
  const column = missionColumnIdForStatus(item.status);
  return column === null ? null : (SECTION_FOR_COLUMN[column] ?? null);
}

export interface TaskListGroupModel {
  id: TaskListSectionId;
  items: KanbanItem[];
}

/**
 * The bands to draw for a set of board items: the segment's own section (or
 * all three), newest movement first, with the empty ones dropped — an empty
 * band vanishes rather than rendering a heading over nothing.
 */
export function taskListGroups(
  items: readonly KanbanItem[],
  filter: TaskListFilterId,
): TaskListGroupModel[] {
  const bands: Record<TaskListSectionId, KanbanItem[]> = {
    needsYou: [],
    running: [],
    done: [],
  };
  for (const item of items) {
    const section = taskListSectionForItem(item);
    if (section !== null) bands[section].push(item);
  }
  const byRecency = (a: KanbanItem, b: KanbanItem) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return taskListSectionsFor(filter).flatMap((id) => {
    const band = [...bands[id]].sort(byRecency);
    return band.length === 0 ? [] : [{ id, items: band }];
  });
}

/** How many of these items are waiting on the user — the one count the
 *  segmented control carries. */
export function taskListNeedsYouCount(items: readonly KanbanItem[]): number {
  return items.filter((item) => taskListSectionForItem(item) === "needsYou")
    .length;
}
