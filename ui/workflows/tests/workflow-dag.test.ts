import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  layerSteps,
  latestRunByWorkflow,
  activeRun,
  isResumable,
  stepStatusOf,
  doneStepCount,
  plannedStepCount,
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
