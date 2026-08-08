import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { childMissionsOf } from "../src/lib/child-missions.ts";

const LABELS = { running: "Running", needsYou: "Needs You", done: "Done" };

function item(
  id: string,
  status: string,
  originSessionKey?: string,
  updatedAt = "2026-08-07T00:00:00.000Z",
) {
  return {
    id,
    title: id,
    status,
    updatedAt,
    ...(originSessionKey ? { metadata: { originSessionKey } } : {}),
  };
}

describe("childMissionsOf", () => {
  it("keeps only the missions this chat started", () => {
    const items = [
      item("mine", "running", "conv-parent"),
      item("someone-elses", "running", "conv-other"),
      item("user-created", "running"),
    ];
    deepStrictEqual(
      childMissionsOf(items, "conv-parent", LABELS).map((m) => m.id),
      ["mine"],
    );
  });

  it("labels each status family the way the board's columns do", () => {
    const items = [
      item("a", "running", "p"),
      item("b", "needs_you", "p"),
      item("c", "error", "p"),
      item("d", "done", "p"),
    ];
    deepStrictEqual(
      childMissionsOf(items, "p", LABELS).map((m) => [
        m.id,
        m.tone,
        m.statusLabel,
      ]),
      [
        ["a", "running", "Running"],
        // error parks in Needs you on the board — the list must not invent a
        // fourth state.
        ["b", "attention", "Needs You"],
        ["c", "attention", "Needs You"],
        ["d", "done", "Done"],
      ],
    );
  });

  it("orders running first, then awaiting review, then done", () => {
    const items = [
      item("done-1", "done", "p"),
      item("needs-1", "needs_you", "p"),
      item("run-1", "running", "p"),
    ];
    deepStrictEqual(
      childMissionsOf(items, "p", LABELS).map((m) => m.id),
      ["run-1", "needs-1", "done-1"],
    );
  });

  it("puts the most recently updated first inside a group", () => {
    const items = [
      item("older", "running", "p", "2026-08-07T01:00:00.000Z"),
      item("newer", "running", "p", "2026-08-07T02:00:00.000Z"),
    ];
    deepStrictEqual(
      childMissionsOf(items, "p", LABELS).map((m) => m.id),
      ["newer", "older"],
    );
  });

  it("drops archived children, as the active board does", () => {
    const items = [item("gone", "archived", "p"), item("here", "running", "p")];
    deepStrictEqual(
      childMissionsOf(items, "p", LABELS).map((m) => m.id),
      ["here"],
    );
  });

  it("is empty with no open chat", () => {
    deepStrictEqual(
      childMissionsOf([item("a", "running", "p")], null, LABELS),
      [],
    );
  });
});
