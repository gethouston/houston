/**
 * ActiveRunPanel — live or completed workflow run: steps, summary, approval.
 */
import { useEffect, useMemo, useState } from "react"
import { cn, Button, Spinner } from "@houston-ai/core"
import type { WorkflowRun } from "./types"
import { StepProgress } from "./step-progress"
import { PlanApprovalDialog } from "./plan-approval-dialog"
import type { PlanApprovalDialogLabels } from "./plan-approval-dialog"
import type { StepProgressLabels } from "./step-progress"
import { DEFAULT_RUN_STATUS_LABELS } from "./run-status"
import type { WorkflowRunStatus } from "./types"
import { WorkflowSummary } from "./workflow-summary"
import {
  awaitingGateStepId,
  isMidrunApprovalGate,
} from "./workflow-dag"

export interface ActiveRunPanelLabels {
  title?: string
  completedTitle?: string
  actionTitle?: string
  planning?: string
  synthesis?: string
  reviewPlan?: string
  reviewAction?: string
  approve?: string
  actionApprove?: string
  cancel?: string
  runStatus?: Partial<Record<WorkflowRunStatus, string>>
  approvalDialog?: PlanApprovalDialogLabels
  actionApprovalDialog?: PlanApprovalDialogLabels
  stepProgress?: StepProgressLabels
}

const DEFAULT_LABELS: Required<
  Omit<
    ActiveRunPanelLabels,
    "runStatus" | "approvalDialog" | "actionApprovalDialog" | "stepProgress"
  >
> = {
  title: "Active run",
  completedTitle: "Run result",
  actionTitle: "Approve next action",
  planning: "Planning your steps…",
  synthesis: "Summary",
  reviewPlan: "Review plan",
  reviewAction: "Review action",
  approve: "Approve",
  actionApprove: "Approve and continue",
  cancel: "Cancel",
}

export interface ActiveRunPanelProps {
  run: WorkflowRun
  onApprove?: () => void
  onCancel?: () => void
  approvePending?: boolean
  labels?: ActiveRunPanelLabels
}

function panelTitle(
  run: WorkflowRun,
  l: typeof DEFAULT_LABELS,
  midrunGate: boolean,
): string {
  if (run.status === "done") return l.completedTitle
  if (midrunGate) return l.actionTitle
  return l.title
}

export function ActiveRunPanel({
  run,
  onApprove,
  onCancel,
  approvePending,
  labels,
}: ActiveRunPanelProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const statusLabels = { ...DEFAULT_RUN_STATUS_LABELS, ...labels?.runStatus }
  const [dialogOpen, setDialogOpen] = useState(false)
  const midrunGate = isMidrunApprovalGate(run)
  const gateStepId = awaitingGateStepId(run)

  const approvalDialogLabels = useMemo((): PlanApprovalDialogLabels | undefined => {
    if (midrunGate) {
      return { ...labels?.approvalDialog, ...labels?.actionApprovalDialog }
    }
    return labels?.approvalDialog
  }, [labels?.approvalDialog, labels?.actionApprovalDialog, midrunGate])

  useEffect(() => {
    if (run.status === "awaiting_approval") {
      setDialogOpen(true)
    }
  }, [run.status, run.id])

  if (run.status === "planning") {
    return (
      <section className="rounded-xl bg-secondary px-5 py-5">
        <div className="flex items-center gap-3">
          <Spinner className="size-4" />
          <p className="text-sm text-muted-foreground">{l.planning}</p>
        </div>
      </section>
    )
  }

  const isTerminal =
    run.status === "done" ||
    run.status === "error" ||
    run.status === "cancelled"
  const showPlan = !!run.plan
  const reviewLabel = midrunGate ? l.reviewAction : l.reviewPlan
  const approveLabel = midrunGate ? l.actionApprove : l.approve

  return (
    <>
      <section className="rounded-xl bg-secondary px-5 py-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {panelTitle(run, l, midrunGate)}
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
          {run.status === "awaiting_approval" && onApprove && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                {reviewLabel}
              </Button>
              <Button size="sm" onClick={onApprove} disabled={approvePending}>
                {approvePending ? "…" : approveLabel}
              </Button>
            </div>
          )}
        </div>

        {showPlan && run.plan && (
          <StepProgress
            plan={run.plan}
            run={run}
            expandSummaries={isTerminal}
            highlightStepId={gateStepId}
            labels={labels?.stepProgress}
          />
        )}

        {run.summary && (
          <div
            className={cn(
              showPlan && "mt-4 pt-4 border-t border-border/40",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {l.synthesis}
            </p>
            <WorkflowSummary content={run.summary} />
          </div>
        )}
      </section>

      {run.status === "awaiting_approval" && onApprove && onCancel && (
        <PlanApprovalDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          run={run}
          onApprove={onApprove}
          onCancel={onCancel}
          approvePending={approvePending}
          highlightStepId={gateStepId}
          labels={approvalDialogLabels}
        />
      )}
    </>
  )
}
