import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Routine, RoutineRun } from "@houston-ai/routines";
import {
  latestRunByRoutine,
  reactionRoutines,
  scheduleRoutines,
} from "../src/components/tabs/routines-tab-model.ts";

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

describe("routines tab model — schedule vs reaction filters", () => {
  function routine(over: Partial<Routine>): Routine {
    return {
      id: "r",
      name: "R",
      prompt: "p",
      enabled: true,
      suppress_when_silent: true,
      chat_mode: "shared",
      integrations: [],
      created_at: "",
      updated_at: "",
      ...over,
    };
  }

  const scheduled = routine({ id: "s1", schedule: "0 9 * * *" });
  const reaction = routine({
    id: "e1",
    trigger: {
      toolkit: "gmail",
      trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
      trigger_config: {},
    },
  });

  it("splits one list into the schedule-driven and event-driven views", () => {
    const all = [scheduled, reaction];
    deepStrictEqual(
      scheduleRoutines(all).map((r) => r.id),
      ["s1"],
    );
    deepStrictEqual(
      reactionRoutines(all).map((r) => r.id),
      ["e1"],
    );
  });

  it("treats undefined as empty (no crash before the list loads)", () => {
    deepStrictEqual(scheduleRoutines(undefined), []);
    deepStrictEqual(reactionRoutines(undefined), []);
  });
});
