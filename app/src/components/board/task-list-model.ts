/**
 * The phone task list's segmented control: its positions and the bands each
 * one leaves standing. Pure, so `app/tests/task-list-model.test.ts` pins them
 * without rendering. How a task falls into a band is the board's own column
 * mapping (`agents-home/agent-missions-model.ts`).
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
