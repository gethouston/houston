import type { WorkflowRun } from "./types"
import { doneStepCount, plannedStepCount } from "./workflow-dag"

export interface RunHintLabels {
  needsApproval?: string
  steps_one?: string
  steps_other?: string
  stepsDone?: string
}

export function runHint(run: WorkflowRun, labels: RunHintLabels): string {
  if (run.status === "awaiting_approval" && labels.needsApproval) {
    return labels.needsApproval
  }
  const total = plannedStepCount(run)
  if (total > 0) {
    const done = doneStepCount(run)
    if (done > 0 && labels.stepsDone) {
      return labels.stepsDone
        .replace("{{done}}", String(done))
        .replace("{{total}}", String(total))
    }
    const stepsLabel = total === 1 ? labels.steps_one : labels.steps_other
    if (stepsLabel) {
      return stepsLabel.replace("{{count}}", String(total))
    }
    return `${total} steps`
  }
  return ""
}
