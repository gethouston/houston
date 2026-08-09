import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { panelTaskLabel } from "../src/components/board/panel-task-label.ts";

const labels = {
  task: (title: string) => `Task: ${title}`,
  newTask: "New task",
};

describe("panelTaskLabel", () => {
  it("names the open task, so the panel never falls back to ui's English", () => {
    assert.equal(
      panelTaskLabel(labels, "a1", "Plan a trip to Tokyo"),
      "Task: Plan a trip to Tokyo",
    );
  });

  it("says NEW task when nothing is selected", () => {
    assert.equal(panelTaskLabel(labels, null, undefined), "New task");
  });

  it("stays blank while a selected task's card has not resolved", () => {
    // Calling an existing chat "New task" for a beat is worse than a gap.
    assert.equal(panelTaskLabel(labels, "a1", undefined), "");
    assert.equal(panelTaskLabel(labels, "a1", ""), "");
  });
});
