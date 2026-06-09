/**
 * run-content-labels — shared label types and panelTitle helper (no JSX).
 */
import type { WorkflowRun, WorkflowRunStatus } from "./types"

export interface RunContentLabels {
  title?: string
  completedTitle?: string
  actionTitle?: string
  planning?: string
  synthesis?: string
  runStatus?: Partial<Record<WorkflowRunStatus, string>>
}

export const DEFAULT_RUN_CONTENT_LABELS: Required<
  Omit<RunContentLabels, "runStatus">
> = {
  title: "Active run",
  completedTitle: "Run result",
  actionTitle: "Approve next action",
  planning: "Planning your steps…",
  synthesis: "Summary",
}

type TitleLabels = Pick<
  RunContentLabels,
  "title" | "completedTitle" | "actionTitle"
> &
  Required<Pick<RunContentLabels, "title" | "completedTitle" | "actionTitle">>

export function panelTitle(
  run: WorkflowRun,
  labels: TitleLabels,
  midrunGate: boolean,
): string {
  if (run.status === "done") return labels.completedTitle
  if (midrunGate) return labels.actionTitle
  return labels.title
}
