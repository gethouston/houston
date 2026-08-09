/**
 * The task line under the agent's name in the board's detail panel.
 *
 * `ui/` is i18n-agnostic, so `KanbanDetailPanel` can only fall back to a raw
 * English "Mission: {title}" — which every normally-opened task wore, in every
 * language. The app therefore composes this line itself and ALWAYS passes it
 * down as `panelMissionLabel`, so the ui default is never the thing on screen.
 *
 * Pure and DOM-free so the three states are unit-tested
 * (`app/tests/panel-task-label.test.ts`).
 */

export interface PanelTaskLabels {
  /** "Task: {{title}}" for an opened task. */
  task: (title: string) => string;
  /** The line for the panel a new task is being composed in. */
  newTask: string;
}

/**
 * Compose the line for the panel's current state:
 * - nothing selected -> the panel is a NEW task's composer;
 * - a selected task -> its title;
 * - selected but its card has not resolved yet -> BLANK, never the new-task
 *   line: naming an existing chat "New task" for a beat is worse than a gap.
 */
export function panelTaskLabel(
  labels: PanelTaskLabels,
  selectedId: string | null,
  title: string | undefined,
): string {
  if (!selectedId) return labels.newTask;
  return title ? labels.task(title) : "";
}
