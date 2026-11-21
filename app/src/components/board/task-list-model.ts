export type TaskListFilterId = "all" | "needs_you" | "running" | "done";

export const TASK_LIST_FILTER_IDS = [
  "all",
  "needs_you",
  "running",
  "done",
] as const satisfies readonly TaskListFilterId[];

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

export function taskListSectionsFor(
  filter: TaskListFilterId,
): readonly TaskListSectionId[] {
  return filter === "all"
    ? TASK_LIST_SECTION_ORDER
    : [SECTION_FOR_FILTER[filter]];
}
