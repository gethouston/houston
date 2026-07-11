import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { RoutineRun } from "@houston-ai/routines";
import { latestRunByRoutine } from "../src/components/tabs/routines-tab-model.ts";

describe("routines tab model — latestRunByRoutine", () => {
  function run(overrides: Partial<RoutineRun>): RoutineRun {
    return {
      id: "run1",
      routine_id: "r1",
      status: "surfaced",
      session_key: "s1",
      started_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("returns an empty map when runs are absent", () => {
    deepStrictEqual(latestRunByRoutine(undefined), {});
  });

  it("returns an empty map for an empty run list", () => {
    deepStrictEqual(latestRunByRoutine([]), {});
  });

  it("keeps the newest run per routine, across multiple routines", () => {
    const older = run({
      id: "a",
      routine_id: "r1",
      started_at: "2026-01-01T00:00:00Z",
    });
    const newer = run({
      id: "b",
      routine_id: "r1",
      started_at: "2026-01-03T00:00:00Z",
    });
    const other = run({
      id: "c",
      routine_id: "r2",
      started_at: "2026-01-02T00:00:00Z",
    });

    const map = latestRunByRoutine([older, newer, other]);

    strictEqual(map.r1.id, "b");
    strictEqual(map.r2.id, "c");
  });

  it("picks the latest by started_at regardless of input order", () => {
    const older = run({ id: "a", started_at: "2026-01-01T00:00:00Z" });
    const newer = run({ id: "b", started_at: "2026-01-03T00:00:00Z" });

    strictEqual(latestRunByRoutine([newer, older]).r1.id, "b");
    strictEqual(latestRunByRoutine([older, newer]).r1.id, "b");
  });
});
