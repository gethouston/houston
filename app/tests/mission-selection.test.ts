import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ARCHIVED_STATUS,
  BULK_MOVE_TARGETS,
  areAllSelected,
  canDropMission,
  isArchived,
  moveTargetsForSection,
  selectActive,
  selectArchived,
  toggleAllIds,
} from "../src/lib/mission-selection.ts";
import { buildMissionBoardColumns } from "../src/components/mission-board-columns.ts";

describe("mission selection", () => {
  const items = [
    { status: "running" },
    { status: "archived" },
    { status: "done" },
    { status: "archived" },
  ];

  it("partitions archived vs active missions", () => {
    strictEqual(selectArchived(items).length, 2);
    deepStrictEqual(
      selectActive(items).map((i) => i.status),
      ["running", "done"],
    );
    ok(isArchived({ status: ARCHIVED_STATUS }));
    ok(!isArchived({ status: "running" }));
  });

  it("limits bulk move targets to done + needs_you", () => {
    const targets = BULK_MOVE_TARGETS as readonly string[];
    ok(!targets.includes("running"));
    ok(!targets.includes("error"));
    ok(!targets.includes(ARCHIVED_STATUS));
    deepStrictEqual([...BULK_MOVE_TARGETS], ["done", "needs_you"]);
  });

  it("offers only the other section as a move target", () => {
    // Locked to needs_you -> can only move to done, and vice versa.
    deepStrictEqual(moveTargetsForSection("needs_you"), ["done"]);
    deepStrictEqual(moveTargetsForSection("done"), ["needs_you"]);
    // running isn't a move target, so both stay; null = nothing locked.
    deepStrictEqual(moveTargetsForSection("running"), ["done", "needs_you"]);
    deepStrictEqual(moveTargetsForSection(null), ["done", "needs_you"]);
  });

  it("allows a drag only across sections, to a bulk-move target", () => {
    // needs_you <-> done are the only legal drops.
    strictEqual(canDropMission("needs_you", "done"), true);
    strictEqual(canDropMission("done", "needs_you"), true);
    // Dropping on the card's own section is a no-op.
    strictEqual(canDropMission("done", "done"), false);
    strictEqual(canDropMission("needs_you", "needs_you"), false);
    // running is never a drop target (matches the bulk-move rule)...
    strictEqual(canDropMission("done", "running"), false);
    strictEqual(canDropMission("needs_you", "running"), false);
    // ...but a running card CAN be dragged out to either section.
    strictEqual(canDropMission("running", "done"), true);
    strictEqual(canDropMission("running", "needs_you"), true);
    // An unknown / out-of-section origin still resolves against the targets.
    strictEqual(canDropMission(null, "done"), true);
    strictEqual(canDropMission(null, "archived"), false);
  });

  it("computes select-all checkbox state", () => {
    const ids = ["a", "b", "c"];
    strictEqual(areAllSelected(ids, new Set(["a", "b", "c"])), true);
    strictEqual(areAllSelected(ids, new Set(["a", "b"])), false);
    // Empty id list is never "all selected" (nothing to select).
    strictEqual(areAllSelected([], new Set(["a"])), false);
  });

  it("toggles a section as one and never mutates the input", () => {
    const ids = ["a", "b"];
    // None/some selected -> add them all.
    const fromNone = toggleAllIds(new Set<string>(), ids);
    deepStrictEqual([...fromNone].sort(), ["a", "b"]);
    const fromSome = toggleAllIds(new Set(["a"]), ids);
    deepStrictEqual([...fromSome].sort(), ["a", "b"]);
    // All selected -> clear them, leaving other selections intact.
    const fromAll = toggleAllIds(new Set(["a", "b", "x"]), ids);
    deepStrictEqual([...fromAll], ["x"]);
    // Input set is not mutated.
    const input = new Set(["a"]);
    toggleAllIds(input, ids);
    deepStrictEqual([...input], ["a"]);
  });

  it("keeps archived out of every board column", () => {
    const columns = buildMissionBoardColumns(
      { running: "R", needsYou: "N", done: "D", newMission: "+" },
      () => {},
    );
    const allStatuses = columns.flatMap((c) => c.statuses);
    ok(!allStatuses.includes(ARCHIVED_STATUS));
  });
});
