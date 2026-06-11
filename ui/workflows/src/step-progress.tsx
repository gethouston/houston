/**
 * StepProgress — dependency-layered step list with per-step status.
 */
import type { ReactNode } from "react"
import type {
  StepState,
  WorkflowPlan,
  WorkflowRun,
  WorkflowStep,
} from "./types"
import {
  layerSteps,
  stepStatusOf,
  stepSummaryOf,
  visibleStepSummary,
} from "./workflow-dag"
import { DEFAULT_STEP_STATUS_LABELS } from "./run-status"
import type { WorkflowStepStatus } from "./types"
import { StepProgressRow } from "./step-progress-row"

export interface StepProgressLabels {
  runsTogether?: string
  retry?: string
  stepStatus?: Partial<Record<WorkflowStepStatus, string>>
}

const DEFAULT_LABELS: Required<Pick<StepProgressLabels, "runsTogether" | "retry">> = {
  runsTogether: "These steps can run together",
  retry: "Retry",
}

export interface StepProgressProps {
  plan: WorkflowPlan
  /** When set, overlays live step status + summaries from the run. */
  run?: WorkflowRun
  /** Show full step summaries (completed runs). */
  expandSummaries?: boolean
  /** Emphasize the step waiting on a mid-run approval gate. */
  highlightStepId?: string
  onRetryStep?: (stepId: string) => void
  retryingStepId?: string
  renderStepDetail?: (
    step: WorkflowStep,
    state: StepState | undefined,
    run: WorkflowRun | undefined,
  ) => ReactNode
  onApprove?: () => void
  onCancel?: () => void
  approvePending?: boolean
  cancelPending?: boolean
  approveLabel?: string
  cancelLabel?: string
  labels?: StepProgressLabels
}

export function StepProgress({
  plan,
  run,
  expandSummaries,
  highlightStepId,
  onRetryStep,
  retryingStepId,
  renderStepDetail,
  onApprove,
  onCancel,
  approvePending,
  cancelPending,
  approveLabel,
  cancelLabel,
  labels,
}: StepProgressProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_STEP_STATUS_LABELS, ...labels?.stepStatus }
  const layers = layerSteps(plan)
  const showStatus = !!run
  const runIsRetryable =
    showStatus && (run.status === "error" || run.status === "cancelled")
  let stepIndex = 0

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
              stepIndex += 1
              const status = showStatus ? stepStatusOf(run, step.id) : undefined
              const summary = showStatus
                ? visibleStepSummary(status, stepSummaryOf(run, step.id))
                : undefined
              const state = run?.steps.find((item) => item.step_id === step.id)
              const highlighted = showStatus && highlightStepId === step.id
              const canRetry =
                runIsRetryable &&
                !!onRetryStep &&
                status !== undefined &&
                (status === "error" || status === "cancelled")
              const showStepApproval = Boolean(
                highlighted &&
                  status === "awaiting_approval" &&
                  onApprove &&
                  onCancel &&
                  approveLabel &&
                  cancelLabel,
              )
              return (
                <StepProgressRow
                  key={step.id}
                  step={step}
                  stepIndex={stepIndex}
                  status={status}
                  summary={summary}
                  state={state}
                  run={run}
                  highlighted={highlighted}
                  expandSummaries={expandSummaries}
                  statusLabel={
                    status ? (statusLabels[status] ?? status) : undefined
                  }
                  retryLabel={l.retry}
                  canRetry={canRetry}
                  showStepApproval={showStepApproval}
                  onRetryStep={onRetryStep}
                  retryingStepId={retryingStepId}
                  onApprove={onApprove}
                  onCancel={onCancel}
                  approvePending={approvePending}
                  cancelPending={cancelPending}
                  approveLabel={approveLabel}
                  cancelLabel={cancelLabel}
                  renderStepDetail={renderStepDetail}
                />
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
