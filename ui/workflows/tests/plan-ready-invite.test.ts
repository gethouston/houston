import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { showsPlanReadyInvite } from "../src/workflow-dag.ts"
import type { WorkflowRun } from "../src/types.ts"

function mkRun(
  id: string,
  workflowId: string,
  status: WorkflowRun["status"],
): WorkflowRun {
  return {
    id,
    workflow_id: workflowId,
    status,
    session_key: `workflow-${workflowId}-run-${id}`,
    steps: [],
    started_at: "2025-01-01T10:00:00Z",
  }
}

describe("showsPlanReadyInvite", () => {
  it("true for inline run awaiting initial approval", () => {
    const run = mkRun("r1", "inline-abc", "awaiting_approval")
    assert.equal(showsPlanReadyInvite(run), true)
  })

  it("false for saved workflow runs", () => {
    const run = mkRun("r1", "wf-saved", "awaiting_approval")
    assert.equal(showsPlanReadyInvite(run), false)
  })

  it("false during planning", () => {
    const run = mkRun("r1", "inline-abc", "planning")
    assert.equal(showsPlanReadyInvite(run), false)
  })

  it("false for mid-run approval gate", () => {
    const run: WorkflowRun = {
      ...mkRun("r1", "inline-abc", "awaiting_approval"),
      steps: [
        { step_id: "a", status: "done", approved: false },
        { step_id: "b", status: "awaiting_approval", approved: false },
      ],
    }
    assert.equal(showsPlanReadyInvite(run), false)
  })
})
