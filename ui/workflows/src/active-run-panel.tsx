/**
 * ActiveRunPanel — live or completed workflow run: steps, summary, approval.
 */
import { useEffect, useState } from "react"
import { cn, Button, Spinner } from "@houston-ai/core"
import type { WorkflowRun } from "./types"
import { StepProgress } from "./step-progress"
import { PlanApprovalDialog } from "./plan-approval-dialog"
import type { PlanApprovalDialogLabels } from "./plan-approval-dialog"
import type { StepProgressLabels } from "./step-progress"
import { DEFAULT_RUN_STATUS_LABELS } from "./run-status"
import type { WorkflowRunStatus } from "./types"
import { WorkflowSummary } from "./workflow-summary"

export interface ActiveRunPanelLabels {
  title?: string
  completedTitle?: string
  planning?: string
  synthesis?: string
  reviewPlan?: string
  approve?: string
  cancel?: string
  runStatus?: Partial<Record<WorkflowRunStatus, string>>
  approvalDialog?: PlanApprovalDialogLabels
  stepProgress?: StepProgressLabels
}

const DEFAULT_LABELS: Required<
  Omit<ActiveRunPanelLabels, "runStatus" | "approvalDialog" | "stepProgress">
> = {
  title: "Active run",
  completedTitle: "Run result",
  planning: "Planning your steps…",
  synthesis: "Summary",
  reviewPlan: "Review plan",
  approve: "Approve",
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
): string {
  if (run.status === "done") return l.completedTitle
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

  return (
    <>
      <section className="rounded-xl bg-secondary px-5 py-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {panelTitle(run, l)}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
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
                {l.reviewPlan}
              </Button>
              <Button size="sm" onClick={onApprove} disabled={approvePending}>
                {approvePending ? "…" : l.approve}
              </Button>
            </div>
          )}
        </div>

        {showPlan && run.plan && (
          <StepProgress
            plan={run.plan}
            run={run}
            expandSummaries={isTerminal}
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
          labels={labels?.approvalDialog}
        />
      )}
    </>
  )
}
