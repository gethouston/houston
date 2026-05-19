import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { navigateBoard } from "../src/lib/board-navigate.ts";

const COLUMNS: KanbanColumnConfig[] = [
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

function item(id: string, status: string, updatedAt = "2025-01-01T00:00:00Z"): KanbanItem {
  return { id, title: id, status, updatedAt };
}

// Sort within a column is updatedAt-desc, so newer items come first.
// Encode that in the ISO timestamps to keep tests legible.
const r1 = item("r1", "running", "2025-01-03T00:00:00Z");
const r2 = item("r2", "running", "2025-01-02T00:00:00Z");
const n1 = item("n1", "needs_you", "2025-01-03T00:00:00Z");
const n2 = item("n2", "needs_you", "2025-01-02T00:00:00Z");
const n3 = item("n3", "needs_you", "2025-01-01T00:00:00Z");
const d1 = item("d1", "done", "2025-01-01T00:00:00Z");

const ITEMS = [r1, r2, n1, n2, n3, d1];

describe("navigateBoard", () => {
  it("picks the first card of the first non-empty column when nothing is selected", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: null }, "down"),
      "r1",
    );
  });

  it("moves down within a column", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n1" }, "down"),
      "n2",
    );
  });

  it("moves up within a column", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n2" }, "up"),
      "n1",
    );
  });

  it("stops at the bottom of a column (no wrap)", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n3" }, "down"),
      null,
    );
  });

  it("stops at the top of a column (no wrap)", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n1" }, "up"),
      null,
    );
  });

  it("moves right to the next non-empty column, keeping the row index when possible", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n2" }, "right"),
      // Done has only d1 → clamp from row 1 to row 0
      "d1",
    );
  });

  it("moves left to the previous non-empty column, clamping the row index", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "n2" }, "left"),
      // Running has r1, r2 → row 1 lands on r2
      "r2",
    );
  });

  it("returns null when there is no column on the right", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "d1" }, "right"),
      null,
    );
  });

  it("returns null when there is no column on the left", () => {
    strictEqual(
      navigateBoard({ items: ITEMS, columns: COLUMNS, selectedId: "r1" }, "left"),
      null,
    );
  });

  it("skips empty columns when moving sideways", () => {
    const items = [r1, d1]; // needs_you column is empty
    strictEqual(
      navigateBoard({ items, columns: COLUMNS, selectedId: "r1" }, "right"),
      "d1",
    );
    strictEqual(
      navigateBoard({ items, columns: COLUMNS, selectedId: "d1" }, "left"),
      "r1",
    );
  });

  it("returns null on an empty board", () => {
    strictEqual(
      navigateBoard({ items: [], columns: COLUMNS, selectedId: null }, "down"),
      null,
    );
  });
});
