/**
 * WorkflowRunHistory — past workflow runs; click a row to inspect steps.
 */
import { cn, Button } from "@houston-ai/core"
import { ChevronRight, Play, Square } from "lucide-react"
import type { WorkflowRun, WorkflowRunStatus } from "./types"
import { DEFAULT_RUN_STATUS_LABELS, RUN_STATUS_DOT } from "./run-status"
import { isResumable } from "./workflow-dag"
import { runHint } from "./run-hint"

export interface WorkflowRunHistoryLabels {
  empty?: string
  resume?: string
  cancel?: string
  view?: string
  needsApproval?: string
  steps_one?: string
  steps_other?: string
  stepsDone?: string
  runStatus?: Partial<Record<WorkflowRunStatus, string>>
}

const DEFAULT_LABELS: Required<
  Omit<WorkflowRunHistoryLabels, "runStatus" | "steps_one" | "steps_other" | "stepsDone">
> = {
  empty: "No runs yet. Start one with Run.",
  resume: "Resume",
  cancel: "Stop",
  view: "View",
  needsApproval: "Needs your approval",
}

export interface WorkflowRunHistoryProps {
  runs: WorkflowRun[]
  selectedRunId?: string | null
  onSelectRun?: (runId: string) => void
  onCancelRun?: (runId: string) => void
  onResumeRun?: (runId: string) => void
  labels?: WorkflowRunHistoryLabels
}

function formatRunTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Yesterday, ${time}`
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`
}

function formatDuration(startedAt: string, completedAt?: string): string | null {
  if (!completedAt) return null
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60_000)}m`
}

function isCancellable(status: WorkflowRunStatus): boolean {
  return (
    status === "planning" ||
    status === "awaiting_approval" ||
    status === "running"
  )
}

export function WorkflowRunHistory({
  runs,
  selectedRunId,
  onSelectRun,
  onCancelRun,
  onResumeRun,
  labels,
}: WorkflowRunHistoryProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_RUN_STATUS_LABELS, ...labels?.runStatus }
  const sorted = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  )

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">{l.empty}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map((run) => {
        const duration = formatDuration(run.started_at, run.completed_at)
        const dotClass = RUN_STATUS_DOT[run.status] ?? "bg-gray-300"
        const canCancel = isCancellable(run.status) && onCancelRun
        const canResume = isResumable(run) && onResumeRun
        const selected = selectedRunId === run.id
        const hint = runHint(run, l)
        const selectable = !!onSelectRun

        return (
          <li key={run.id}>
            <div
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
              onClick={selectable ? () => onSelectRun!(run.id) : undefined}
              onKeyDown={
                selectable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onSelectRun!(run.id)
                      }
                    }
                  : undefined
              }
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
                "bg-background border border-black/[0.04]",
                "transition-shadow duration-150",
                selectable && "cursor-pointer hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                selected && "ring-1 ring-foreground/15 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                run.status === "awaiting_approval" &&
                  "border-amber-500/30 bg-amber-500/[0.04]",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full shrink-0", dotClass)}
                aria-hidden
              />
              <span className="text-xs text-muted-foreground tabular-nums w-36 shrink-0">
                {formatRunTime(run.started_at)}
              </span>
              <span
                className={cn(
                  "text-xs w-24 shrink-0",
                  run.status === "error"
                    ? "text-red-500"
                    : run.status === "awaiting_approval"
                      ? "text-amber-700"
                      : "text-muted-foreground",
                )}
              >
                {statusLabels[run.status]}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums w-12 shrink-0">
                {duration ?? ""}
              </span>
              <span
                className={cn(
                  "text-xs truncate flex-1 min-w-0",
                  run.status === "awaiting_approval"
                    ? "text-amber-800 font-medium"
                    : "text-muted-foreground/80",
                )}
              >
                {hint}
              </span>
              {selectable && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs shrink-0",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {l.view}
                  <ChevronRight className="size-3" />
                </span>
              )}
              {canResume && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onResumeRun!(run.id)
                  }}
                  className="shrink-0 h-7 text-xs"
                >
                  <Play className="size-3" />
                  {l.resume}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCancelRun!(run.id)
                  }}
                  aria-label={l.cancel}
                  className="shrink-0"
                >
                  <Square className="size-3" />
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
