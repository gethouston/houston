/**
 * StepProgressRow — single step row with status, summary, and optional actions.
 */
import { cn, Button } from "@houston-ai/core"
import { Check, RotateCcw } from "lucide-react"
import type { ReactNode } from "react"
import type { StepState, WorkflowRun, WorkflowStep, WorkflowStepStatus } from "./types"
import { RunApprovalActions } from "./run-approval-actions"
import { STEP_STATUS_DOT } from "./run-status"

export interface StepProgressRowProps {
  step: WorkflowStep
  stepIndex: number
  status?: WorkflowStepStatus
  summary?: string
  state?: StepState
  run?: WorkflowRun
  highlighted: boolean
  expandSummaries?: boolean
  statusLabel?: string
  retryLabel: string
  canRetry: boolean
  showStepApproval: boolean
  onRetryStep?: (stepId: string) => void
  retryingStepId?: string
  onApprove?: () => void
  onCancel?: () => void
  approvePending?: boolean
  cancelPending?: boolean
  approveLabel?: string
  cancelLabel?: string
  renderStepDetail?: (
    step: WorkflowStep,
    state: StepState | undefined,
    run: WorkflowRun | undefined,
  ) => ReactNode
}

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "done") {
    return (
      <span
        className={cn(
          "size-4 rounded-full shrink-0 flex items-center justify-center",
          STEP_STATUS_DOT.done,
        )}
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

function DefinitionStepMarker({ index }: { index: number }) {
  return (
    <span
      className={cn(
        "size-4 rounded-full shrink-0 flex items-center justify-center",
        "text-[10px] font-medium tabular-nums text-muted-foreground",
        "border border-muted-foreground/25 bg-muted/30",
      )}
      aria-hidden
    >
      {index}
    </span>
  )
}

export function StepProgressRow({
  step,
  stepIndex,
  status,
  summary,
  state,
  run,
  highlighted,
  expandSummaries,
  statusLabel,
  retryLabel,
  canRetry,
  showStepApproval,
  onRetryStep,
  retryingStepId,
  onApprove,
  onCancel,
  approvePending,
  cancelPending,
  approveLabel,
  cancelLabel,
  renderStepDetail,
}: StepProgressRowProps) {
  const showStatus = status !== undefined

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg bg-background",
        "border border-black/[0.04] px-3 py-2.5",
        highlighted &&
          "border-amber-500/40 bg-amber-500/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]",
        showStatus &&
          status === "awaiting_approval" &&
          !highlighted &&
          "border-amber-500/25 bg-amber-500/[0.03]",
      )}
    >
      {showStatus && status ? (
        <StepIcon status={status} />
      ) : (
        <DefinitionStepMarker index={stepIndex} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm text-foreground">{step.task}</p>
          {showStatus && status && statusLabel && (
            <span
              className={cn(
                "text-[11px]",
                status === "awaiting_approval"
                  ? "text-amber-700 font-medium"
                  : "text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          )}
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
        {renderStepDetail?.(step, state, run)}
        {showStepApproval &&
          onApprove &&
          onCancel &&
          approveLabel &&
          cancelLabel && (
            <RunApprovalActions
              onApprove={onApprove}
              onCancel={onCancel}
              approveLabel={approveLabel}
              cancelLabel={cancelLabel}
              approvePending={approvePending}
              cancelPending={cancelPending}
              className="mt-2"
            />
          )}
      </div>
      {canRetry && onRetryStep && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRetryStep(step.id)}
          disabled={retryingStepId === step.id}
          className="shrink-0 h-7 text-xs"
        >
          <RotateCcw className="size-3" />
          {retryingStepId === step.id ? "…" : retryLabel}
        </Button>
      )}
    </li>
  )
}
