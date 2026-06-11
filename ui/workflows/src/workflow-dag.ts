import type {
  WorkflowPlan,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepStatus,
} from "./types"

/** In-flight run statuses (not terminal). */
const ACTIVE_STATUSES = new Set<WorkflowRunStatus>([
  "planning",
  "awaiting_approval",
  "waiting_for_connection",
  "running",
])

/** True when a run can be stopped via `cancel_run`. */
export function isCancellable(status: WorkflowRunStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

/** Topological layers via Kahn's algorithm. Steps in the same layer can run in parallel. */
export function layerSteps(plan: WorkflowPlan): WorkflowStep[][] {
  const steps = plan.steps
  if (steps.length === 0) return []

  const byId = new Map(steps.map((s) => [s.id, s]))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const step of steps) {
    inDegree.set(step.id, 0)
    dependents.set(step.id, [])
  }

  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (!byId.has(dep)) continue
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1)
      dependents.get(dep)!.push(step.id)
    }
  }

  const layers: WorkflowStep[][] = []
  let queue = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0)

  while (queue.length > 0) {
    layers.push(queue)
    const next: WorkflowStep[] = []
    for (const step of queue) {
      for (const childId of dependents.get(step.id) ?? []) {
        const deg = (inDegree.get(childId) ?? 1) - 1
        inDegree.set(childId, deg)
        if (deg === 0) {
          const child = byId.get(childId)
          if (child) next.push(child)
        }
      }
    }
    queue = next
  }

  // Steps unreachable due to cycles or missing deps — append as final layer.
  const placed = new Set(layers.flat().map((s) => s.id))
  const orphans = steps.filter((s) => !placed.has(s.id))
  if (orphans.length > 0) layers.push(orphans)

  return layers
}

/** Most recent run per workflow id, keyed by `workflow_id`. */
export function latestRunByWorkflow(
  runs: WorkflowRun[] | undefined,
): Record<string, WorkflowRun> {
  if (!runs) return {}
  const map: Record<string, WorkflowRun> = {}
  for (const run of runs) {
    const existing = map[run.workflow_id]
    if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
      map[run.workflow_id] = run
    }
  }
  return map
}

/** Pick the in-flight run for a workflow, if any. */
export function activeRun(
  runs: WorkflowRun[] | undefined,
  workflowId: string,
): WorkflowRun | undefined {
  if (!runs) return undefined
  return runs
    .filter(
      (r) => r.workflow_id === workflowId && ACTIVE_STATUSES.has(r.status),
    )
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )[0]
}

/** True when a failed/cancelled run can be resumed. */
export function isResumable(run: WorkflowRun): boolean {
  if (run.status !== "error" && run.status !== "cancelled") return false
  if (!run.plan?.steps.length) return false
  const done = new Set(
    run.steps.filter((s) => s.status === "done").map((s) => s.step_id),
  )
  return run.plan.steps.some((s) => !done.has(s.id))
}

/** Lookup per-step execution status on a run. */
export function stepStatusOf(
  run: WorkflowRun,
  stepId: string,
): WorkflowStepStatus {
  return run.steps.find((s) => s.step_id === stepId)?.status ?? "pending"
}

/** Brief summary text for a step, if the executor wrote one. */
export function stepSummaryOf(
  run: WorkflowRun,
  stepId: string,
): string | undefined {
  return run.steps.find((s) => s.step_id === stepId)?.summary
}

/** Step summary visible only once the step has reached a terminal state. */
export function visibleStepSummary(
  status: WorkflowStepStatus | undefined,
  summary: string | undefined,
): string | undefined {
  if (!summary || status === undefined) return undefined
  if (status === "done" || status === "error" || status === "cancelled") {
    return summary
  }
  return undefined
}

/** Run synthesis is shown only after the run has finished. */
export function shouldShowRunSynthesis(
  isTerminal: boolean,
  summary: string | undefined,
): boolean {
  return isTerminal && !!summary
}

/** Count of finished steps on a run (for history row hints). */
export function doneStepCount(run: WorkflowRun): number {
  return run.steps.filter((s) => s.status === "done").length
}

/** Total planned steps, when a plan exists. */
export function plannedStepCount(run: WorkflowRun): number {
  return run.plan?.steps.length ?? 0
}

/** True when any step is waiting on a user approval gate. */
export function hasAwaitingStep(run: WorkflowRun): boolean {
  return run.steps.some((s) => s.status === "awaiting_approval")
}

const TERMINAL_STATUSES = new Set<WorkflowRunStatus>([
  "done",
  "error",
  "cancelled",
])

/** True when the run is in-flight and waiting on user approval (any step). */
export function isRunAwaitingUserAction(run: WorkflowRun): boolean {
  if (run.status === "planning") return false
  if (TERMINAL_STATUSES.has(run.status)) return false
  return hasAwaitingStep(run) || run.status === "awaiting_approval"
}

/** Run or step state where the user can approve the next action. */
export function needsStepApproval(run: WorkflowRun): boolean {
  return isRunAwaitingUserAction(run)
}

/** Run paused at a mid-run gate after at least one step finished. */
export function isMidrunApprovalGate(run: WorkflowRun): boolean {
  return hasAwaitingStep(run) && doneStepCount(run) > 0
}

/** True when the inline chat card should show the plan-ready invite. */
export function showsPlanReadyInvite(run: WorkflowRun): boolean {
  return (
    run.workflow_id.startsWith("inline-") &&
    run.status === "awaiting_approval" &&
    !isMidrunApprovalGate(run)
  )
}

/** Step id waiting on a mid-run approval gate, if any. */
export function awaitingGateStepId(run: WorkflowRun): string | undefined {
  return run.steps.find((s) => s.status === "awaiting_approval")?.step_id
}

/** User-facing run status line; prefers approval-needed when a step is gated. */
export function runStatusSubtitle(
  run: WorkflowRun,
  statusLabels: Record<WorkflowRunStatus, string>,
): string {
  if (
    hasAwaitingStep(run) &&
    run.status !== "awaiting_approval" &&
    run.status !== "planning"
  ) {
    return statusLabels.awaiting_approval
  }
  return statusLabels[run.status]
}
