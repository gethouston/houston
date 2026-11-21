import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { columnDragRole, defaultCanDropItem } from "../src/dnd.ts";
import type { KanbanColumn, KanbanItem } from "../src/types.ts";

const item = (status: string): KanbanItem => ({
  id: "a1",
  title: "Mission",
  status,
  lastMessageAt: "2026-01-01T00:00:00.000Z",
});

const col = (id: string, statuses: string[]): KanbanColumn => ({
  id,
  label: id,
  statuses,
});

describe("defaultCanDropItem", () => {
  it("allows dropping onto a column that does not already hold the status", () => {
    assert.equal(
      defaultCanDropItem(item("needs_you"), col("done", ["done"])),
      true,
    );
  });

  it("rejects dropping onto the card's own section", () => {
    assert.equal(
      defaultCanDropItem(item("done"), col("done", ["done"])),
      false,
    );
  });

  it("treats every status mapped to a column as the same section", () => {
    const needsYou = col("needs_you", ["needs_you", "error"]);
    assert.equal(defaultCanDropItem(item("error"), needsYou), false);
    assert.equal(defaultCanDropItem(item("needs_you"), needsYou), false);
    assert.equal(defaultCanDropItem(item("done"), needsYou), true);
  });
});

describe("columnDragRole", () => {
  const done = col("done", ["done"]);
  const needsYou = col("needs_you", ["needs_you", "error"]);
  const running = col("running", ["running"]);

  it("is idle when nothing is being dragged", () => {
    assert.equal(columnDragRole(null, done, true), "idle");
  });

  it("marks the dragged card's own section as origin (no-op, not forbidden)", () => {
    assert.equal(columnDragRole(item("needs_you"), needsYou, false), "origin");
    assert.equal(columnDragRole(item("error"), needsYou, false), "origin");
  });

  it("marks an eligible section as a drop target", () => {
    assert.equal(columnDragRole(item("needs_you"), done, true), "drop-target");
  });

  it("marks an ineligible non-origin section as forbidden", () => {
    assert.equal(
      columnDragRole(item("needs_you"), running, false),
      "forbidden",
    );
  });

  it("treats origin before eligibility (origin can never be forbidden)", () => {
    assert.equal(columnDragRole(item("done"), done, true), "origin");
  });
});
