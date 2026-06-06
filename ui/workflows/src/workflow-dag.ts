import type {
  WorkflowPlan,
  WorkflowRun,
  WorkflowStep,
  WorkflowStepStatus,
} from "./types"

/** In-flight run statuses (not terminal). */
const ACTIVE_STATUSES = new Set([
  "planning",
  "awaiting_approval",
  "running",
])

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

/** Count of finished steps on a run (for history row hints). */
export function doneStepCount(run: WorkflowRun): number {
  return run.steps.filter((s) => s.status === "done").length
}

/** Total planned steps, when a plan exists. */
export function plannedStepCount(run: WorkflowRun): number {
  return run.plan?.steps.length ?? 0
}
