/**
 * PlanApprovalDialog — review a generated plan before execution.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core"
import type { WorkflowRun } from "./types"
import { StepProgress } from "./step-progress"
import type { StepProgressLabels } from "./step-progress"

export interface PlanApprovalDialogLabels {
  title?: string
  description?: string
  approve?: string
  cancel?: string
  approving?: string
  stepProgress?: StepProgressLabels
}

const DEFAULT_LABELS: Required<Omit<PlanApprovalDialogLabels, "stepProgress">> = {
  title: "Review plan",
  description: "Approve this plan before the agent starts working.",
  approve: "Approve and run",
  cancel: "Cancel run",
  approving: "Approving…",
}

export interface PlanApprovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: WorkflowRun
  onApprove: () => void
  onCancel: () => void
  approvePending?: boolean
  labels?: PlanApprovalDialogLabels
}

export function PlanApprovalDialog({
  open,
  onOpenChange,
  run,
  onApprove,
  onCancel,
  approvePending,
  labels,
}: PlanApprovalDialogProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const plan = run.plan
  if (!plan) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{l.description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          <StepProgress plan={plan} run={run} labels={labels?.stepProgress} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={onCancel} disabled={approvePending}>
            {l.cancel}
          </Button>
          <Button onClick={onApprove} disabled={approvePending}>
            {approvePending ? l.approving : l.approve}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
