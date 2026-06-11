/**

 * ActiveRunPanel — live or completed workflow run: steps, summary, approval.

 */

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@houston-ai/core"

import type { StepState, WorkflowRun, WorkflowStep } from "./types"

import { PlanApprovalDialog } from "./plan-approval-dialog"

import type { PlanApprovalDialogLabels } from "./plan-approval-dialog"

import type { StepProgressLabels } from "./step-progress"

import { DEFAULT_RUN_STATUS_LABELS } from "./run-status"

import type { WorkflowRunStatus } from "./types"

import {

  DEFAULT_RUN_CONTENT_LABELS,

  PlanningRow,

  RunDetails,

  RunHeading,

} from "./run-content"

import {

  awaitingGateStepId,

  isMidrunApprovalGate,

  needsStepApproval,

} from "./workflow-dag"

import type { PlanReadyInviteLabels } from "./plan-ready-invite"



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

  stop?: string

  planReadyInvite?: PlanReadyInviteLabels

  runStatus?: Partial<Record<WorkflowRunStatus, string>>

  approvalDialog?: PlanApprovalDialogLabels

  actionApprovalDialog?: PlanApprovalDialogLabels

  stepProgress?: StepProgressLabels

}



const DEFAULT_LABELS: Required<

  Omit<

    ActiveRunPanelLabels,

    | "runStatus"
    | "approvalDialog"
    | "actionApprovalDialog"
    | "stepProgress"
    | "stop"
    | "planReadyInvite"

  >

> = {

  ...DEFAULT_RUN_CONTENT_LABELS,

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

  onRetryStep?: (stepId: string) => void

  retryingStepId?: string

  renderStepDetail?: (
    step: WorkflowStep,
    state: StepState | undefined,
    run: WorkflowRun | undefined,
  ) => ReactNode

  approvePending?: boolean

  labels?: ActiveRunPanelLabels

}



export function ActiveRunPanel({

  run,

  onApprove,

  onCancel,

  onRetryStep,

  retryingStepId,

  renderStepDetail,

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



  const awaitingApproval = needsStepApproval(run)

  useEffect(() => {

    if (awaitingApproval) {

      setDialogOpen(true)

    }

  }, [awaitingApproval, run.id])



  if (run.status === "planning") {

    return (

      <section className="rounded-xl bg-secondary px-5 py-5">

        <PlanningRow planningLabel={l.planning} />

      </section>

    )

  }



  const isTerminal =

    run.status === "done" ||

    run.status === "error" ||

    run.status === "cancelled"

  const reviewLabel = midrunGate ? l.reviewAction : l.reviewPlan

  const approveLabel = midrunGate ? l.actionApprove : l.approve



  return (

    <>

      <section className="rounded-xl bg-secondary px-5 py-5">

        <div className="flex items-center justify-between gap-3 mb-4">

          <RunHeading

            run={run}

            midrunGate={midrunGate}

            labels={l}

            statusLabels={statusLabels}

          />

          {awaitingApproval && onApprove && (

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



        <RunDetails

          run={run}

          isTerminal={isTerminal}

          gateStepId={gateStepId}

          synthesisLabel={l.synthesis}

          stepProgressLabels={labels?.stepProgress}

          onRetryStep={onRetryStep}

          retryingStepId={retryingStepId}

          renderStepDetail={renderStepDetail}

          onApprove={awaitingApproval && onApprove ? onApprove : undefined}

          onCancel={awaitingApproval && onCancel ? onCancel : undefined}

          approvePending={approvePending}

          approveLabel={approveLabel}

          cancelLabel={l.cancel}

        />

      </section>



      {awaitingApproval && onApprove && onCancel && (

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


