import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  BOARD_CARD_DRAG_TYPE,
  columnDragRole,
  defaultCanDropItem,
} from "../src/dnd.ts"
import type { KanbanColumn, KanbanItem } from "../src/types.ts"

const item = (status: string): KanbanItem => ({
  id: "a1",
  title: "Mission",
  status,
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const col = (id: string, statuses: string[]): KanbanColumn => ({
  id,
  label: id,
  statuses,
})

describe("defaultCanDropItem", () => {
  it("allows dropping onto a column that does not already hold the status", () => {
    assert.equal(defaultCanDropItem(item("needs_you"), col("done", ["done"])), true)
  })

  it("rejects dropping onto the card's own section", () => {
    assert.equal(defaultCanDropItem(item("done"), col("done", ["done"])), false)
  })

  it("treats every status mapped to a column as the same section", () => {
    // `error` lives in the needs_you column, so a move there is a no-op.
    const needsYou = col("needs_you", ["needs_you", "error"])
    assert.equal(defaultCanDropItem(item("error"), needsYou), false)
    assert.equal(defaultCanDropItem(item("needs_you"), needsYou), false)
    assert.equal(defaultCanDropItem(item("done"), needsYou), true)
  })
})

describe("columnDragRole", () => {
  const done = col("done", ["done"])
  const needsYou = col("needs_you", ["needs_you", "error"])
  const running = col("running", ["running"])

  it("is idle when nothing is being dragged", () => {
    assert.equal(columnDragRole(null, done, true), "idle")
  })

  it("marks the dragged card's own section as origin (no-op, not forbidden)", () => {
    // The card lives in needs_you; that column can't accept it (canDrop=false)
    // but it's the origin, not a forbidden target.
    assert.equal(columnDragRole(item("needs_you"), needsYou, false), "origin")
    // A status mapped into the same column is still the origin section.
    assert.equal(columnDragRole(item("error"), needsYou, false), "origin")
  })

  it("marks an eligible section as a drop target", () => {
    assert.equal(columnDragRole(item("needs_you"), done, true), "drop-target")
  })

  it("marks an ineligible non-origin section as forbidden", () => {
    // Running never accepts a manual drop, and it's not the card's section.
    assert.equal(columnDragRole(item("needs_you"), running, false), "forbidden")
  })

  it("treats origin before eligibility (origin can never be forbidden)", () => {
    // Even if a buggy canDrop said true, the card's own section stays origin.
    assert.equal(columnDragRole(item("done"), done, true), "origin")
  })
})

describe("BOARD_CARD_DRAG_TYPE", () => {
  it("is a stable, namespaced MIME type", () => {
    assert.equal(BOARD_CARD_DRAG_TYPE, "application/x-houston-kanban-card")
  })
})
