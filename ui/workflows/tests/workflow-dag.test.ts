import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  layerSteps,
  latestRunByWorkflow,
  activeRun,
  isCancellable,
  isResumable,
  stepStatusOf,
  doneStepCount,
  plannedStepCount,
  isMidrunApprovalGate,
  awaitingGateStepId,
  hasAwaitingStep,
  needsStepApproval,
  isRunAwaitingUserAction,
  runStatusSubtitle,
  visibleStepSummary,
  shouldShowRunSynthesis,
} from "../src/workflow-dag.ts"
import type { WorkflowPlan, WorkflowRun } from "../src/types.ts"

describe("layerSteps", () => {
  it("returns empty for no steps", () => {
    assert.deepEqual(layerSteps({ steps: [] }), [])
  })

  it("layers a linear chain", () => {
    const plan: WorkflowPlan = {
      steps: [
        { id: "a", task: "A", use_worktree: false, depends_on: [] },
        { id: "b", task: "B", use_worktree: false, depends_on: ["a"] },
        { id: "c", task: "C", use_worktree: false, depends_on: ["b"] },
      ],
    }
    const layers = layerSteps(plan)
    assert.equal(layers.length, 3)
    assert.deepEqual(layers[0]!.map((s) => s.id), ["a"])
    assert.deepEqual(layers[1]!.map((s) => s.id), ["b"])
    assert.deepEqual(layers[2]!.map((s) => s.id), ["c"])
  })

  it("groups parallel steps in one layer", () => {
    const plan: WorkflowPlan = {
      steps: [
        { id: "a", task: "A", use_worktree: false, depends_on: [] },
        { id: "b", task: "B", use_worktree: false, depends_on: [] },
        { id: "c", task: "C", use_worktree: false, depends_on: ["a", "b"] },
      ],
    }
    const layers = layerSteps(plan)
    assert.equal(layers.length, 2)
    assert.deepEqual(layers[0]!.map((s) => s.id).sort(), ["a", "b"])
    assert.deepEqual(layers[1]!.map((s) => s.id), ["c"])
  })

  it("tolerates missing dependency ids", () => {
    const plan: WorkflowPlan = {
      steps: [
        { id: "a", task: "A", use_worktree: false, depends_on: ["missing"] },
        { id: "b", task: "B", use_worktree: false, depends_on: ["a"] },
      ],
    }
    const layers = layerSteps(plan)
    assert.equal(layers.length, 2)
    assert.deepEqual(layers[0]!.map((s) => s.id), ["a"])
    assert.deepEqual(layers[1]!.map((s) => s.id), ["b"])
  })
})

describe("latestRunByWorkflow", () => {
  it("picks the most recent run per workflow", () => {
    const runs: WorkflowRun[] = [
      mkRun("r1", "w1", "done", "2025-01-01T10:00:00Z"),
      mkRun("r2", "w1", "done", "2025-01-02T10:00:00Z"),
      mkRun("r3", "w2", "error", "2025-01-01T10:00:00Z"),
    ]
    const map = latestRunByWorkflow(runs)
    assert.equal(map.w1!.id, "r2")
    assert.equal(map.w2!.id, "r3")
  })
})

describe("activeRun", () => {
  it("returns the newest in-flight run", () => {
    const runs: WorkflowRun[] = [
      mkRun("r1", "w1", "planning", "2025-01-01T10:00:00Z"),
      mkRun("r2", "w1", "running", "2025-01-02T10:00:00Z"),
      mkRun("r3", "w1", "done", "2025-01-03T10:00:00Z"),
    ]
    assert.equal(activeRun(runs, "w1")!.id, "r2")
  })

  it("returns undefined when no active run", () => {
    const runs: WorkflowRun[] = [
      mkRun("r1", "w1", "done", "2025-01-01T10:00:00Z"),
    ]
    assert.equal(activeRun(runs, "w1"), undefined)
  })

  it("treats connection-blocked runs as active", () => {
    const runs = [
      mkRun("r1", "w1", "waiting_for_connection", "2025-01-01T10:00:00Z"),
    ]
    assert.equal(activeRun(runs, "w1")?.id, "r1")
  })
})

describe("isResumable", () => {
  it("true for error with incomplete steps", () => {
    const run = mkRun("r1", "w1", "error", "2025-01-01T10:00:00Z")
    run.plan = {
      steps: [
        { id: "a", task: "A", use_worktree: false, depends_on: [] },
        { id: "b", task: "B", use_worktree: false, depends_on: ["a"] },
      ],
    }
    run.steps = [{ step_id: "a", status: "done" }]
    assert.equal(isResumable(run), true)
  })

  it("false when all steps done", () => {
    const run = mkRun("r1", "w1", "error", "2025-01-01T10:00:00Z")
    run.plan = {
      steps: [{ id: "a", task: "A", use_worktree: false, depends_on: [] }],
    }
    run.steps = [{ step_id: "a", status: "done" }]
    assert.equal(isResumable(run), false)
  })

  it("false for running status", () => {
    const run = mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z")
    assert.equal(isResumable(run), false)
  })
})

describe("stepStatusOf", () => {
  it("defaults to pending", () => {
    const run = mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z")
    assert.equal(stepStatusOf(run, "missing"), "pending")
  })
})

describe("isCancellable", () => {
  it("true for in-flight statuses", () => {
    assert.equal(isCancellable("planning"), true)
    assert.equal(isCancellable("awaiting_approval"), true)
    assert.equal(isCancellable("waiting_for_connection"), true)
    assert.equal(isCancellable("running"), true)
  })

  it("false for terminal statuses", () => {
    assert.equal(isCancellable("done"), false)
    assert.equal(isCancellable("error"), false)
    assert.equal(isCancellable("cancelled"), false)
  })
})

describe("hasAwaitingStep / needsStepApproval", () => {
  it("detects awaiting steps while the run is still running", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
        { step_id: "c", status: "running", approved: false },
      ],
    }
    assert.equal(hasAwaitingStep(run), true)
    assert.equal(needsStepApproval(run), true)
  })

  it("false when no step awaits approval", () => {
    const run = mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z")
    assert.equal(hasAwaitingStep(run), false)
    assert.equal(needsStepApproval(run), false)
  })

  it("true when awaiting step while run waits for connection", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "waiting_for_connection", "2025-01-01T10:00:00Z"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
        { step_id: "c", status: "waiting_for_connection", approved: false },
      ],
    }
    assert.equal(needsStepApproval(run), true)
    assert.equal(isRunAwaitingUserAction(run), true)
  })

  it("false during planning even if steps exist", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "planning", "2025-01-01T10:00:00Z"),
      steps: [{ step_id: "a", status: "awaiting_approval", approved: false }],
    }
    assert.equal(needsStepApproval(run), false)
    assert.equal(isRunAwaitingUserAction(run), false)
  })
})

describe("isMidrunApprovalGate", () => {
  it("true when awaiting approval after a done step", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "awaiting_approval", "2025-01-01T10:00:00Z"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
      ],
    }
    assert.equal(isMidrunApprovalGate(run), true)
    assert.equal(awaitingGateStepId(run), "b")
  })

  it("true while parallel steps are still running", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
        { step_id: "c", status: "running", approved: false },
      ],
    }
    assert.equal(isMidrunApprovalGate(run), true)
    assert.equal(awaitingGateStepId(run), "b")
  })

  it("false for initial plan approval", () => {
    const run = mkRun("r1", "w1", "awaiting_approval", "2025-01-01T10:00:00Z")
    assert.equal(isMidrunApprovalGate(run), false)
  })
})

describe("runStatusSubtitle", () => {
  const statusLabels = {
    planning: "Planning",
    awaiting_approval: "Needs approval",
    waiting_for_connection: "Needs connection",
    running: "Running",
    done: "Done",
    error: "Error",
    cancelled: "Cancelled",
  }

  it("prefers approval label while parallel steps run", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
        { step_id: "c", status: "running", approved: false },
      ],
    }
    assert.equal(runStatusSubtitle(run, statusLabels), "Needs approval")
  })

  it("uses run status when no step awaits approval", () => {
    const run = mkRun("r1", "w1", "running", "2025-01-01T10:00:00Z")
    assert.equal(runStatusSubtitle(run, statusLabels), "Running")
  })
})

describe("doneStepCount / plannedStepCount", () => {
  it("counts finished steps and plan size", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "w1", "done", "2025-01-01T10:00:00Z"),
      plan: {
        steps: [
          { id: "a", task: "A", depends_on: [] },
          { id: "b", task: "B", depends_on: [] },
        ],
      },
      steps: [
        { step_id: "a", status: "done" },
        { step_id: "b", status: "pending" },
      ],
    }
    assert.equal(plannedStepCount(run), 2)
    assert.equal(doneStepCount(run), 1)
  })
})

function mkRun(
  id: string,
  workflowId: string,
  status: WorkflowRun["status"],
  startedAt: string,
): WorkflowRun {
  return {
    id,
    workflow_id: workflowId,
    status,
    session_key: `workflow-${workflowId}-run-${id}`,
    steps: [],
    started_at: startedAt,
  }
}

describe("visibleStepSummary", () => {
  it("hides summary while step is in flight", () => {
    assert.equal(visibleStepSummary("pending", "boom"), undefined)
    assert.equal(visibleStepSummary("running", "boom"), undefined)
  })

  it("shows summary for terminal step statuses", () => {
    assert.equal(visibleStepSummary("done", "ok"), "ok")
    assert.equal(visibleStepSummary("error", "boom"), "boom")
    assert.equal(visibleStepSummary("cancelled", "stopped"), "stopped")
  })
})

describe("shouldShowRunSynthesis", () => {
  it("hides synthesis while run is in flight", () => {
    assert.equal(
      shouldShowRunSynthesis(false, "one or more workflow steps failed"),
      false,
    )
  })

  it("shows synthesis only for terminal runs with content", () => {
    assert.equal(shouldShowRunSynthesis(true, "all done"), true)
    assert.equal(shouldShowRunSynthesis(true, undefined), false)
    assert.equal(shouldShowRunSynthesis(false, "stale error"), false)
  })
})
