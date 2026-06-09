/**
 * InlineRunCard — chat inline workflow run with connect-card styling.
 */
import { Button } from "@houston-ai/core"
import type { WorkflowRun } from "./types"
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
  isMidrunApprovalGate,
} from "./workflow-dag"

export type InlineRunCardLabels = Omit<
  ActiveRunPanelLabels,
  "reviewPlan" | "reviewAction" | "approvalDialog" | "actionApprovalDialog"
>

const DEFAULT_LABELS: Required<
  Omit<InlineRunCardLabels, "runStatus" | "stepProgress">
> = {
  ...DEFAULT_RUN_CONTENT_LABELS,
  approve: "Approve",
  actionApprove: "Approve and continue",
  cancel: "Cancel",
}

export interface InlineRunCardProps {
  run: WorkflowRun
  onApprove?: () => void
  onCancel?: () => void
  approvePending?: boolean
  labels?: InlineRunCardLabels
}

export function InlineRunCard({
  run,
  onApprove,
  onCancel,
  approvePending,
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
      />

      {showApprovalActions && (
        <div className="flex items-center justify-end gap-1.5 mt-4 pt-4 border-t border-border/40">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={approvePending}
          >
            {l.cancel}
          </Button>
          <Button size="sm" onClick={onApprove} disabled={approvePending}>
            {approvePending ? "…" : approveLabel}
          </Button>
        </div>
      )}
    </section>
  )
}
