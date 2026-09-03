import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { KanbanItem } from "@houston-ai/board";
import {
  TASK_LIST_FILTER_IDS,
  taskListGroups,
  taskListNeedsYouCount,
  taskListSectionForItem,
  taskListSectionsFor,
} from "../src/components/board/task-list-model.ts";

// The phone task list's shared rules. The promise both lists keep: a task sits
// in the same band here as the column it occupies on the desktop board.

const item = (
  over: Partial<KanbanItem> & { id: string; status: string },
): KanbanItem => ({
  title: `Task ${over.id}`,
  updatedAt: "2026-08-28T10:00:00Z",
  ...over,
});

describe("taskListSectionForItem", () => {
  it("follows the board's own status mapping", () => {
    assert.equal(
      taskListSectionForItem(item({ id: "r", status: "running" })),
      "running",
    );
    assert.equal(
      taskListSectionForItem(item({ id: "n", status: "needs_you" })),
      "needsYou",
    );
    // An errored task waits with the ones needing the user, as on the board.
    assert.equal(
      taskListSectionForItem(item({ id: "e", status: "error" })),
      "needsYou",
    );
    assert.equal(
      taskListSectionForItem(item({ id: "d", status: "done" })),
      "done",
    );
  });

  it("claims no band for a status no column owns", () => {
    assert.equal(
      taskListSectionForItem(item({ id: "a", status: "archived" })),
      null,
    );
  });
});

describe("taskListSectionsFor", () => {
  it("keeps all three bands under All and exactly one under a segment", () => {
    assert.deepEqual(taskListSectionsFor("all"), [
      "needsYou",
      "running",
      "done",
    ]);
    assert.deepEqual(taskListSectionsFor("needs_you"), ["needsYou"]);
    assert.deepEqual(taskListSectionsFor("running"), ["running"]);
    assert.deepEqual(taskListSectionsFor("done"), ["done"]);
  });

  it("has a section for every segment but All", () => {
    for (const id of TASK_LIST_FILTER_IDS)
      assert.equal(taskListSectionsFor(id).length, id === "all" ? 3 : 1);
  });
});

describe("taskListGroups", () => {
  const items = [
    item({ id: "r", status: "running", updatedAt: "2026-08-28T09:00:00Z" }),
    item({ id: "n1", status: "needs_you", updatedAt: "2026-08-28T08:00:00Z" }),
    item({ id: "n2", status: "error", updatedAt: "2026-08-28T11:00:00Z" }),
    item({ id: "a", status: "archived" }),
  ];

  it("draws the bands in order, newest movement first, and drops the empty ones", () => {
    assert.deepEqual(
      taskListGroups(items, "all").map((g) => [g.id, g.items.map((i) => i.id)]),
      [
        ["needsYou", ["n2", "n1"]],
        ["running", ["r"]],
      ],
    );
  });

  it("a segment leaves only its own band standing", () => {
    assert.deepEqual(
      taskListGroups(items, "running").map((g) => g.id),
      ["running"],
    );
    assert.deepEqual(taskListGroups(items, "done"), []);
  });

  it("never draws an archived task on the active list", () => {
    const ids = taskListGroups(items, "all").flatMap((g) =>
      g.items.map((i) => i.id),
    );
    assert.ok(!ids.includes("a"));
  });
});

describe("taskListNeedsYouCount", () => {
  it("counts what is waiting on the user, errors included", () => {
    assert.equal(
      taskListNeedsYouCount([
        item({ id: "n", status: "needs_you" }),
        item({ id: "e", status: "error" }),
        item({ id: "r", status: "running" }),
        item({ id: "a", status: "archived" }),
      ]),
      2,
    );
  });
});
