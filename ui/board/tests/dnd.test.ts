import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { BOARD_CARD_DRAG_TYPE, defaultCanDropItem } from "../src/dnd.ts"
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

describe("BOARD_CARD_DRAG_TYPE", () => {
  it("is a stable, namespaced MIME type", () => {
    assert.equal(BOARD_CARD_DRAG_TYPE, "application/x-houston-kanban-card")
  })
})
