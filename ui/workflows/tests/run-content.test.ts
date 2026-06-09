import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  DEFAULT_RUN_CONTENT_LABELS,
  panelTitle,
} from "../src/run-content-labels.ts"
import type { WorkflowRun } from "../src/types.ts"

function minimalRun(status: WorkflowRun["status"]): WorkflowRun {
  return {
    id: "run-1",
    workflow_id: "wf-1",
    session_key: "workflow-wf-1-run-run-1",
    status,
    steps: [],
    started_at: "2026-01-01T00:00:00Z",
  }
}

describe("panelTitle", () => {
  const labels = DEFAULT_RUN_CONTENT_LABELS

  it("returns completedTitle when run is done", () => {
    assert.equal(panelTitle(minimalRun("done"), labels, false), labels.completedTitle)
    assert.equal(panelTitle(minimalRun("done"), labels, true), labels.completedTitle)
  })

  it("returns actionTitle on a mid-run approval gate", () => {
    assert.equal(
      panelTitle(minimalRun("awaiting_approval"), labels, true),
      labels.actionTitle,
    )
  })

  it("returns title for non-terminal, non-gate states", () => {
    assert.equal(panelTitle(minimalRun("running"), labels, false), labels.title)
    assert.equal(
      panelTitle(minimalRun("awaiting_approval"), labels, false),
      labels.title,
    )
  })
})
