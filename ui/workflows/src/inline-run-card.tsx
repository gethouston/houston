/**
 * InlineRunCard — chat inline workflow run with connect-card styling.
 */
import { Button } from "@houston-ai/core"
import type { ReactNode } from "react"
import type { StepState, WorkflowRun, WorkflowStep } from "./types"
import type { ActiveRunPanelLabels } from "./active-run-panel"
import {
  DEFAULT_RUN_CONTENT_LABELS,
  PlanningRow,
  RunDetails,
  RunHeading,
} from "./run-content"
import { DEFAULT_RUN_STATUS_LABELS } from "./run-status"
import {
  awaitingGateStepId,
  isCancellable,
  isMidrunApprovalGate,
} from "./workflow-dag"

export type InlineRunCardLabels = Omit<
  ActiveRunPanelLabels,
  "reviewPlan" | "reviewAction" | "approvalDialog" | "actionApprovalDialog"
> & {
  stop?: string
}

const DEFAULT_LABELS: Required<
  Omit<InlineRunCardLabels, "runStatus" | "stepProgress">
> = {
  ...DEFAULT_RUN_CONTENT_LABELS,
  approve: "Approve",
  actionApprove: "Approve and continue",
  cancel: "Cancel",
  stop: "Stop",
}

export interface InlineRunSavePromptLabels {
  title: string
  description: string
  confirm: string
  cancel: string
  successTitle: string
  successDescription: string
}

export interface InlineRunSavePrompt {
  /** `offer` shows save/dismiss actions; `saved` shows a confirmation message. */
  state: "offer" | "saved"
  savedName?: string
  onConfirm?: () => void
  onDismiss?: () => void
  confirmPending?: boolean
  labels: InlineRunSavePromptLabels
}

export interface InlineRunCardProps {
  run: WorkflowRun
  onApprove?: () => void
  onCancel?: () => void
  onRetryStep?: (stepId: string) => void
  retryingStepId?: string
  renderStepDetail?: (
    step: WorkflowStep,
    state: StepState | undefined,
    run: WorkflowRun | undefined,
  ) => ReactNode
  approvePending?: boolean
  cancelPending?: boolean
  savePrompt?: InlineRunSavePrompt
  labels?: InlineRunCardLabels
}

function InlineRunSaveFooter({ savePrompt }: { savePrompt: InlineRunSavePrompt }) {
  const { labels: l, state } = savePrompt

  if (state === "saved") {
    return (
      <div className="mt-4 pt-4 border-t border-border/40 space-y-1">
        <p className="text-sm font-medium text-foreground">{l.successTitle}</p>
        <p className="text-xs text-muted-foreground">{l.successDescription}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{l.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{l.description}</p>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={savePrompt.onDismiss}
          disabled={savePrompt.confirmPending}
        >
          {l.cancel}
        </Button>
        <Button
          size="sm"
          onClick={savePrompt.onConfirm}
          disabled={savePrompt.confirmPending}
        >
          {savePrompt.confirmPending ? "…" : l.confirm}
        </Button>
      </div>
    </div>
  )
}

export function InlineRunCard({
  run,
  onApprove,
  onCancel,
  onRetryStep,
  retryingStepId,
  renderStepDetail,
  approvePending,
  cancelPending,
  savePrompt,
  labels,
}: InlineRunCardProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_RUN_STATUS_LABELS, ...labels?.runStatus }
  const midrunGate = isMidrunApprovalGate(run)
  const gateStepId = awaitingGateStepId(run)

  if (run.status === "planning") {
    return (
      <section className="rounded-xl border border-black/5 bg-background px-3 py-2.5">
        <PlanningRow planningLabel={l.planning} />
        {onCancel && (
          <div className="flex items-center justify-end mt-4 pt-4 border-t border-border/40">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={cancelPending}
            >
              {l.stop}
            </Button>
          </div>
        )}
      </section>
    )
  }

  const isTerminal =
    run.status === "done" ||
    run.status === "error" ||
    run.status === "cancelled"
  const approveLabel = midrunGate ? l.actionApprove : l.approve

  const showApprovalActions =
    run.status === "awaiting_approval" && onApprove && onCancel
  const showStopAction =
    run.status !== "awaiting_approval" && isCancellable(run.status) && onCancel

  return (
    <section className="rounded-xl border border-black/5 bg-background px-3 py-2.5">
      <div className="mb-4">
        <RunHeading
          run={run}
          midrunGate={midrunGate}
          labels={l}
          statusLabels={statusLabels}
        />
      </div>

      <RunDetails
        run={run}
        isTerminal={isTerminal}
        gateStepId={gateStepId}
        synthesisLabel={l.synthesis}
        stepProgressLabels={labels?.stepProgress}
        onRetryStep={onRetryStep}
        retryingStepId={retryingStepId}
        renderStepDetail={renderStepDetail}
      />

      {showApprovalActions && (
        <div className="flex items-center justify-end gap-1.5 mt-4 pt-4 border-t border-border/40">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={approvePending || cancelPending}
          >
            {l.cancel}
          </Button>
          <Button size="sm" onClick={onApprove} disabled={approvePending}>
            {approvePending ? "…" : approveLabel}
          </Button>
        </div>
      )}

      {showStopAction && (
        <div className="flex items-center justify-end mt-4 pt-4 border-t border-border/40">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={cancelPending}
          >
            {l.stop}
          </Button>
        </div>
      )}

      {run.status === "done" && savePrompt && (
        <InlineRunSaveFooter savePrompt={savePrompt} />
      )}
    </section>
  )
}
