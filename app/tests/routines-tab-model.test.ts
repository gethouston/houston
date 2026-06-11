import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Routine, RoutineRun } from "@houston-ai/routines";
import {
  EMPTY_FORM,
  formMatchesRoutine,
  freshRoutinesState,
  latestRunByRoutine,
  routineToFormData,
} from "../src/components/tabs/routines-tab-model.ts";

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    name: "Morning digest",
    description: "Summarize overnight email",
    prompt: "Summarize my inbox.",
    schedule: "0 9 * * 1-5",
    enabled: true,
    suppress_when_silent: false,
    chat_mode: "shared",
    timezone: "America/Los_Angeles",
    integrations: ["gmail", "slack"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("routines tab model — fresh state", () => {
  // This is the regression guard for issue #400: editing a routine under one
  // agent, switching agents, then opening the Routines tab must NOT show the
  // previous agent's edit. The tab resets to `freshRoutinesState()` on agent
  // change, so that state must be the closed grid with a blank, clean form.
  it("resets to the grid view", () => {
    deepStrictEqual(freshRoutinesState().view, { type: "grid" });
  });

  it("resets the form and baseline to blank", () => {
    const fresh = freshRoutinesState();
    deepStrictEqual(fresh.form, EMPTY_FORM);
    deepStrictEqual(fresh.baseline, EMPTY_FORM);
  });

  it("reports no unsaved changes (Save disabled) right after a reset", () => {
    const fresh = freshRoutinesState();
    strictEqual(formMatchesRoutine(fresh.form, fresh.baseline), true);
  });
});

describe("routines tab model — routineToFormData", () => {
  it("projects every editable field off the stored routine", () => {
    deepStrictEqual(routineToFormData(routine()), {
      name: "Morning digest",
      description: "Summarize overnight email",
      prompt: "Summarize my inbox.",
      schedule: "0 9 * * 1-5",
      suppress_when_silent: false,
      chat_mode: "shared",
      timezone: "America/Los_Angeles",
      integrations: ["gmail", "slack"],
      provider: null,
      model: null,
      effort: null,
    });
  });

  it("normalizes an absent timezone to null", () => {
    strictEqual(routineToFormData(routine({ timezone: undefined })).timezone, null);
  });
});

describe("routines tab model — formMatchesRoutine", () => {
  it("treats an unedited form as matching", () => {
    const form = routineToFormData(routine());
    strictEqual(formMatchesRoutine(form, routineToFormData(routine())), true);
  });

  it("detects edits to a scalar field", () => {
    const baseline = routineToFormData(routine());
    strictEqual(
      formMatchesRoutine({ ...baseline, name: "Evening digest" }, baseline),
      false,
    );
  });

  it("detects a chat_mode toggle", () => {
    const baseline = routineToFormData(routine());
    strictEqual(
      formMatchesRoutine({ ...baseline, chat_mode: "per_run" }, baseline),
      false,
    );
  });

  it("detects a reordered or resized integrations list", () => {
    const baseline = routineToFormData(routine());
    strictEqual(
      formMatchesRoutine({ ...baseline, integrations: ["slack", "gmail"] }, baseline),
      false,
    );
    strictEqual(
      formMatchesRoutine({ ...baseline, integrations: ["gmail"] }, baseline),
      false,
    );
  });

  it("treats null and undefined timezone as equal", () => {
    const baseline = routineToFormData(routine({ timezone: null }));
    strictEqual(
      formMatchesRoutine({ ...baseline, timezone: undefined }, baseline),
      true,
    );
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

  it("keeps the newest run per routine", () => {
    const older = run({ id: "a", routine_id: "r1", started_at: "2026-01-01T00:00:00Z" });
    const newer = run({ id: "b", routine_id: "r1", started_at: "2026-01-03T00:00:00Z" });
    const other = run({ id: "c", routine_id: "r2", started_at: "2026-01-02T00:00:00Z" });

    const map = latestRunByRoutine([older, newer, other]);

    strictEqual(map.r1.id, "b");
    strictEqual(map.r2.id, "c");
  });

  it("ignores ordering of the input", () => {
    const older = run({ id: "a", started_at: "2026-01-01T00:00:00Z" });
    const newer = run({ id: "b", started_at: "2026-01-03T00:00:00Z" });

    strictEqual(latestRunByRoutine([newer, older]).r1.id, "b");
    strictEqual(latestRunByRoutine([older, newer]).r1.id, "b");
  });
});
