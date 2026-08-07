import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { RoutineRun } from "@houston-ai/routines";
import {
  adoptDraft,
  deselectIfOn,
  latestRunByRoutine,
  runChatActivity,
  selectionRoutineId,
  toggleRoutine,
} from "../src/components/tabs/routines-tab-model.ts";

describe("routines tab model — adoptDraft", () => {
  it("adopts the fresh id only while still waiting on the null draft", () => {
    deepStrictEqual(adoptDraft({ kind: "draft", activityId: null }, "a1"), {
      kind: "draft",
      activityId: "a1",
    });
  });

  it("clears the selection when the draft start failed (no id)", () => {
    strictEqual(adoptDraft({ kind: "draft", activityId: null }, null), null);
  });

  it("leaves a user who already moved on alone", () => {
    const routine = { kind: "routine", routineId: "r1" } as const;
    deepStrictEqual(adoptDraft(routine, "a1"), routine);
    const adopted = { kind: "draft", activityId: "a0" } as const;
    deepStrictEqual(adoptDraft(adopted, "a1"), adopted);
  });

  it("leaves the intake and the cleared selection untouched", () => {
    const intake = { kind: "intake" } as const;
    deepStrictEqual(adoptDraft(intake, "a1"), intake);
    strictEqual(adoptDraft(null, "a1"), null);
    strictEqual(adoptDraft(null, null), null);
  });
});

describe("routines tab model — deselectIfOn", () => {
  it("falls back to the detail screen only when still on that routine's chat", () => {
    deepStrictEqual(
      deselectIfOn({ kind: "routineChat", routineId: "r1" }, "r1"),
      { kind: "routine", routineId: "r1" },
    );
  });

  it("leaves the detail screen, other routines, and null untouched", () => {
    const detail = { kind: "routine", routineId: "r1" } as const;
    deepStrictEqual(deselectIfOn(detail, "r1"), detail);
    const other = { kind: "routineChat", routineId: "r2" } as const;
    deepStrictEqual(deselectIfOn(other, "r1"), other);
    strictEqual(deselectIfOn(null, "r1"), null);
  });

  it("leaves the intake untouched", () => {
    const intake = { kind: "intake" } as const;
    deepStrictEqual(deselectIfOn(intake, "r1"), intake);
  });
});

describe("routines tab model — selectionRoutineId", () => {
  it("resolves every routine-scoped kind, and nothing else", () => {
    strictEqual(selectionRoutineId({ kind: "routine", routineId: "r1" }), "r1");
    strictEqual(
      selectionRoutineId({ kind: "routineChat", routineId: "r1" }),
      "r1",
    );
    strictEqual(
      selectionRoutineId({ kind: "runChat", routineId: "r1", runId: "x" }),
      "r1",
    );
    strictEqual(selectionRoutineId({ kind: "intake" }), null);
    strictEqual(selectionRoutineId({ kind: "draft", activityId: "a" }), null);
    strictEqual(selectionRoutineId(null), null);
  });
});

describe("routines tab model — toggleRoutine", () => {
  it("selects a routine's detail screen from nothing selected", () => {
    deepStrictEqual(toggleRoutine(null, "r1"), {
      kind: "routine",
      routineId: "r1",
    });
  });

  it("deselects on a re-click of the same routine — from its screen or chats", () => {
    strictEqual(
      toggleRoutine({ kind: "routine", routineId: "r1" }, "r1"),
      null,
    );
    strictEqual(
      toggleRoutine({ kind: "routineChat", routineId: "r1" }, "r1"),
      null,
    );
    strictEqual(
      toggleRoutine({ kind: "runChat", routineId: "r1", runId: "x" }, "r1"),
      null,
    );
  });

  it("switches selection from another routine, draft, or intake", () => {
    const target = { kind: "routine", routineId: "r1" } as const;
    deepStrictEqual(
      toggleRoutine({ kind: "routine", routineId: "r2" }, "r1"),
      target,
    );
    deepStrictEqual(
      toggleRoutine({ kind: "draft", activityId: "a" }, "r1"),
      target,
    );
    deepStrictEqual(toggleRoutine({ kind: "intake" }, "r1"), target);
  });
});

describe("routines tab model — runChatActivity", () => {
  const routine = {
    id: "r1",
    name: "Inbox Zero",
    prompt: "p",
    enabled: true,
    suppress_when_silent: false,
    chat_mode: "shared",
    integrations: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    // biome-ignore lint/suspicious/noExplicitAny: minimal fixture
  } as any;

  it("carries the run's real session key and a client-only id", () => {
    const activity = runChatActivity(routine, {
      id: "run9",
      routine_id: "r1",
      status: "surfaced",
      session_key: "routine-r1",
      started_at: "2026-01-02T00:00:00Z",
      completed_at: "2026-01-02T00:01:00Z",
    });
    strictEqual(activity.id, "routine-run-run9");
    strictEqual(activity.session_key, "routine-r1");
    strictEqual(activity.status, "done");
    strictEqual(activity.updated_at, "2026-01-02T00:01:00Z");
  });

  it("marks an in-flight run as running", () => {
    const activity = runChatActivity(routine, {
      id: "run9",
      routine_id: "r1",
      status: "running",
      session_key: "routine-r1-run9",
      started_at: "2026-01-02T00:00:00Z",
    });
    strictEqual(activity.status, "running");
    strictEqual(activity.updated_at, "2026-01-02T00:00:00Z");
  });
});

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
