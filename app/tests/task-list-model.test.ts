import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TASK_LIST_FILTER_IDS,
  taskListSectionsFor,
} from "../src/components/board/task-list-model.ts";

// The phone task list's segmented control: every segment leaves exactly the
// bands it names.

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
