/**
 * StepProgress — dependency-layered step list with per-step status.
 */
import { cn } from "@houston-ai/core"
import { Check } from "lucide-react"
import type { WorkflowPlan, WorkflowRun } from "./types"
import { layerSteps } from "./workflow-dag"
import { stepStatusOf, stepSummaryOf } from "./workflow-dag"
import {
  DEFAULT_STEP_STATUS_LABELS,
  STEP_STATUS_DOT,
} from "./run-status"
import type { WorkflowStepStatus } from "./types"

export interface StepProgressLabels {
  runsTogether?: string
  stepStatus?: Partial<Record<WorkflowStepStatus, string>>
}

const DEFAULT_LABELS: Required<Pick<StepProgressLabels, "runsTogether">> = {
  runsTogether: "These steps can run together",
}

export interface StepProgressProps {
  plan: WorkflowPlan
  /** When set, overlays live step status + summaries from the run. */
  run?: WorkflowRun
  /** Show full step summaries (completed runs). */
  expandSummaries?: boolean
  /** Emphasize the step waiting on a mid-run approval gate. */
  highlightStepId?: string
  labels?: StepProgressLabels
}

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "done") {
    return (
      <span
        className={cn("size-4 rounded-full shrink-0 flex items-center justify-center", STEP_STATUS_DOT.done)}
        aria-hidden
      >
        <Check className="size-2.5 text-white" strokeWidth={3} />
      </span>
    )
  }
  return (
    <span
      className={cn("size-4 rounded-full shrink-0", STEP_STATUS_DOT[status])}
      aria-hidden
    />
  )
}

export function StepProgress({
  plan,
  run,
  expandSummaries,
  highlightStepId,
  labels,
}: StepProgressProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_STEP_STATUS_LABELS, ...labels?.stepStatus }
  const layers = layerSteps(plan)

  return (
    <div className="space-y-4">
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx}>
          {layer.length > 1 && (
            <p className="text-[11px] text-muted-foreground mb-2">
              {l.runsTogether}
            </p>
          )}
          <ul className="space-y-2">
            {layer.map((step) => {
              const status = run ? stepStatusOf(run, step.id) : "pending"
              const summary = run ? stepSummaryOf(run, step.id) : undefined
              const highlighted = highlightStepId === step.id
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg bg-background",
                    "border border-black/[0.04] px-3 py-2.5",
                    highlighted &&
                      "border-amber-500/40 bg-amber-500/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]",
                    status === "awaiting_approval" &&
                      !highlighted &&
                      "border-amber-500/25 bg-amber-500/[0.03]",
                  )}
                >
                  <StepIcon status={status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm text-foreground">{step.task}</p>
                      <span
                        className={cn(
                          "text-[11px]",
                          status === "awaiting_approval"
                            ? "text-amber-700 font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {statusLabels[status] ?? status}
                      </span>
                    </div>
                    {step.depends_on.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {step.depends_on.join(", ")}
                      </p>
                    )}
                    {(step.provider || step.model || step.use_worktree) && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {[step.provider, step.model, step.effort, step.use_worktree ? "worktree" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {summary && (
                      <p
                        className={cn(
                          "text-xs text-muted-foreground mt-1",
                          !expandSummaries && "line-clamp-2",
                        )}
                      >
                        {summary}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
