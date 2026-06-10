/**
 * WorkflowRow — single row in the workflows list.
 */
import { cn } from "@houston-ai/core"
import type { Workflow, WorkflowRun, WorkflowRunStatus } from "./types"
import { DEFAULT_RUN_STATUS_LABELS, RUN_STATUS_DOT } from "./run-status"

export interface WorkflowRowLabels {
  untitled?: string
  noRunsYet?: string
  justRan?: string
  ranMinutesAgo?: string
  ranHoursAgo?: string
  ranDaysAgo?: string
  runStatus?: Partial<Record<WorkflowRunStatus, string>>
}

const DEFAULT_LABELS: Required<
  Omit<WorkflowRowLabels, "runStatus">
> = {
  untitled: "Untitled",
  noRunsYet: "No runs yet",
  justRan: "just ran",
  ranMinutesAgo: "ran {{count}}m ago",
  ranHoursAgo: "ran {{count}}h ago",
  ranDaysAgo: "ran {{count}}d ago",
}

export interface WorkflowRowProps {
  workflow: Workflow
  lastRun?: WorkflowRun
  onClick?: () => void
  labels?: WorkflowRowLabels
}

function lastRunLabel(
  lastRun: WorkflowRun | undefined,
  now: Date,
  labels: WorkflowRowLabels & typeof DEFAULT_LABELS,
): string | null {
  if (!lastRun) return labels.noRunsYet
  const date = new Date(lastRun.started_at)
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return labels.justRan
  if (mins < 60) {
    return labels.ranMinutesAgo?.replace("{{count}}", String(mins)) ?? `ran ${mins}m ago`
  }
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return labels.ranHoursAgo?.replace("{{count}}", String(hours)) ?? `ran ${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return labels.ranDaysAgo?.replace("{{count}}", String(days)) ?? `ran ${days}d ago`
}

export function WorkflowRow({
  workflow,
  lastRun,
  onClick,
  labels,
}: WorkflowRowProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_RUN_STATUS_LABELS, ...labels?.runStatus }
  const now = new Date()
  const lastLabel = lastRunLabel(lastRun, now, l)
  const status = lastRun?.status
  const dotClass = status ? RUN_STATUS_DOT[status] : "bg-gray-300"
  const isActive =
    status === "planning" ||
    status === "awaiting_approval" ||
    status === "waiting_for_connection" ||
    status === "running"

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 cursor-pointer",
        "transition-colors duration-150",
        "hover:bg-black/[0.03]",
        "focus-visible:outline-none focus-visible:bg-black/[0.03]",
      )}
    >
      <div className={cn("size-2 rounded-full shrink-0", dotClass)} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate leading-tight">
          {workflow.name || l.untitled}
        </p>
        {workflow.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {workflow.description}
          </p>
        )}
      </div>

      <div className="hidden sm:flex flex-col items-end shrink-0 min-w-[120px]">
        {status && (
          <p
            className={cn(
              "text-xs",
              status === "error" ? "text-red-500" : "text-muted-foreground",
            )}
          >
            {statusLabels[status]}
          </p>
        )}
        {lastLabel && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums">
            {lastLabel}
          </p>
        )}
      </div>

      {isActive && (
        <span className="text-[11px] text-blue-600 font-medium shrink-0 sm:hidden">
          {status ? statusLabels[status] : null}
        </span>
      )}
    </div>
  )
}
