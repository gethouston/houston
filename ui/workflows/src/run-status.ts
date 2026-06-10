import type { WorkflowRunStatus, WorkflowStepStatus } from "./types"

/** Default English run-status labels (overridden via `labels` props). */
export const DEFAULT_RUN_STATUS_LABELS: Record<WorkflowRunStatus, string> = {
  planning: "Planning",
  awaiting_approval: "Needs approval",
  waiting_for_connection: "Needs connection",
  running: "Running",
  done: "Done",
  error: "Error",
  cancelled: "Cancelled",
}

export const DEFAULT_STEP_STATUS_LABELS: Record<WorkflowStepStatus, string> = {
  pending: "Pending",
  awaiting_approval: "Needs approval",
  waiting_for_connection: "Needs connection",
  running: "Running",
  done: "Done",
  error: "Error",
  cancelled: "Cancelled",
}

export const RUN_STATUS_DOT: Record<WorkflowRunStatus, string> = {
  planning: "bg-blue-500 animate-pulse",
  awaiting_approval: "bg-amber-500",
  waiting_for_connection: "bg-amber-500",
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  error: "bg-red-500",
  cancelled: "bg-gray-400",
}

export const STEP_STATUS_DOT: Record<WorkflowStepStatus, string> = {
  pending: "border border-muted-foreground/40 bg-transparent",
  awaiting_approval: "bg-amber-500",
  waiting_for_connection: "bg-amber-500",
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  error: "bg-red-500",
  cancelled: "bg-gray-400",
}
