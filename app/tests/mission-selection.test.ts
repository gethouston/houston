import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildMissionBoardColumns } from "../src/components/mission-board-columns.ts";
import {
  ARCHIVED_STATUS,
  BULK_MOVE_TARGETS,
  canDropMission,
  moveTargetsForSection,
  selectAllIds,
} from "../src/lib/mission-selection.ts";

describe("mission selection", () => {
  it("limits bulk move targets to done + needs_you", () => {
    const targets = BULK_MOVE_TARGETS as readonly string[];
    ok(!targets.includes("running"));
    ok(!targets.includes("error"));
    ok(!targets.includes(ARCHIVED_STATUS));
    deepStrictEqual([...BULK_MOVE_TARGETS], ["done", "needs_you"]);
  });

  it("offers only the other section as a move target", () => {
    deepStrictEqual(moveTargetsForSection("needs_you"), ["done"]);
    deepStrictEqual(moveTargetsForSection("done"), ["needs_you"]);
    deepStrictEqual(moveTargetsForSection("running"), ["done", "needs_you"]);
    deepStrictEqual(moveTargetsForSection(null), ["done", "needs_you"]);
  });

  it("allows a drag only across sections, to a bulk-move target", () => {
    strictEqual(canDropMission("needs_you", "done"), true);
    strictEqual(canDropMission("done", "needs_you"), true);
    strictEqual(canDropMission("done", "done"), false);
    strictEqual(canDropMission("needs_you", "needs_you"), false);
    strictEqual(canDropMission("done", "running"), false);
    strictEqual(canDropMission("needs_you", "running"), false);
    strictEqual(canDropMission("running", "done"), true);
    strictEqual(canDropMission("running", "needs_you"), true);
    strictEqual(canDropMission(null, "done"), true);
    strictEqual(canDropMission(null, "archived"), false);
  });

  it("selects a whole section additively and never mutates the input", () => {
    const ids = ["a", "b"];
    const fromNone = selectAllIds(new Set<string>(), ids);
    deepStrictEqual([...fromNone].sort(), ["a", "b"]);
    const fromSome = selectAllIds(new Set(["a", "x"]), ids);
    deepStrictEqual([...fromSome].sort(), ["a", "b", "x"]);
    const fromAll = selectAllIds(new Set(["a", "b", "x"]), ids);
    deepStrictEqual([...fromAll].sort(), ["a", "b", "x"]);
    const input = new Set(["a"]);
    selectAllIds(input, ids);
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
