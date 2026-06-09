/**
 * run-content — shared rendering for ActiveRunPanel and InlineRunCard.
 */
import { cn, Spinner } from "@houston-ai/core"
import type { WorkflowRun, WorkflowRunStatus } from "./types"
import { StepProgress } from "./step-progress"
import type { StepProgressLabels } from "./step-progress"
import { WorkflowSummary } from "./workflow-summary"
import {
  DEFAULT_RUN_CONTENT_LABELS,
  panelTitle,
  type RunContentLabels,
} from "./run-content-labels"

export {
  DEFAULT_RUN_CONTENT_LABELS,
  panelTitle,
  type RunContentLabels,
} from "./run-content-labels"

export interface RunContentRenderLabels extends RunContentLabels {
  stepProgress?: StepProgressLabels
}

export function RunHeading({
  run,
  midrunGate,
  labels,
  statusLabels,
}: {
  run: WorkflowRun
  midrunGate: boolean
  labels: typeof DEFAULT_RUN_CONTENT_LABELS
  statusLabels: Record<WorkflowRunStatus, string>
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">
        {panelTitle(run, labels, midrunGate)}
      </h3>
      <p
        className={cn(
          "text-xs mt-0.5",
          midrunGate ? "text-amber-700" : "text-muted-foreground",
        )}
      >
        {statusLabels[run.status]}
      </p>
    </div>
  )
}

export function RunDetails({
  run,
  isTerminal,
  gateStepId,
  synthesisLabel,
  stepProgressLabels,
  onRetryStep,
  retryingStepId,
}: {
  run: WorkflowRun
  isTerminal: boolean
  gateStepId: string | undefined
  synthesisLabel: string
  stepProgressLabels?: StepProgressLabels
  onRetryStep?: (stepId: string) => void
  retryingStepId?: string
}) {
  const showPlan = !!run.plan

  return (
    <>
      {showPlan && run.plan && (
        <StepProgress
          plan={run.plan}
          run={run}
          expandSummaries={isTerminal}
          highlightStepId={gateStepId}
          onRetryStep={onRetryStep}
          retryingStepId={retryingStepId}
          labels={stepProgressLabels}
        />
      )}

      {run.summary && (
        <div
          className={cn(showPlan && "mt-4 pt-4 border-t border-border/40")}
        >
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {synthesisLabel}
          </p>
          <WorkflowSummary content={run.summary} />
        </div>
      )}
    </>
  )
}

export function PlanningRow({ planningLabel }: { planningLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <Spinner className="size-4" />
      <p className="text-sm text-muted-foreground">{planningLabel}</p>
    </div>
  )
}
