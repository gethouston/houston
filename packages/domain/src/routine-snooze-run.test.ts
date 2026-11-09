import type { Routine, RoutineRun, RoutineRunFailure } from "@houston/protocol";
import { expect, test } from "vitest";
import { createRoutine } from "./routine-edit";
import {
  routineSnooze,
  snoozeAfterRun,
  snoozeRoutine,
  USAGE_LIMIT_MAX_SNOOZE_MS,
  unsnoozeAfterRun,
} from "./routine-snooze";

const EDITED = "2026-10-01T00:00:00.000Z";
const STARTED = "2026-10-08T20:47:00.000Z";
const NOW = "2026-10-08T20:47:30.000Z";
const RESET = "2026-10-13T05:00:00.000Z";

const LIMIT: Extract<RoutineRunFailure, { code: "usage_limit" }> = {
  code: "usage_limit",
  provider: "anthropic",
  model: "claude-fable-5",
  resets_at: RESET,
};

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Signups", prompt: "check", schedule: "*/5 * * * *" },
    "r1",
    EDITED,
  ),
  created_by: "felipe",
  ...over,
});

const run = (over: Partial<RoutineRun> = {}): RoutineRun => ({
  id: "run-1",
  routine_id: "r1",
  status: "error",
  session_key: "routine-r1",
  started_at: STARTED,
  failure: LIMIT,
  ...over,
});

test("a scheduled routine's usage-limit run on the creator's account snoozes it", () => {
  expect(snoozeAfterRun(routine(), run(), NOW, "felipe")?.until).toBe(RESET);
  // A path that always runs as the creator passes no actor.
  expect(snoozeAfterRun(routine(), run(), NOW)?.until).toBe(RESET);
  // Pinned to the very model and provider the limit names: still snoozed.
  expect(
    snoozeAfterRun(
      routine({ provider: "anthropic", model: "claude-fable-5" }),
      run(),
      NOW,
      "felipe",
    ),
  ).not.toBeNull();
});

test("a run on someone else's account never snoozes the creator's schedule", () => {
  expect(snoozeAfterRun(routine(), run(), NOW, "julia")).toBeNull();
  expect(snoozeAfterRun(routine(), run(), NOW, null)).toBeNull();
});

test("a trigger routine is never snoozed: the snooze only gates schedules", () => {
  const { schedule: _cron, ...rest } = routine();
  const trigger: Routine = { ...rest, trigger: { kind: "webhook" } };
  expect(snoozeAfterRun(trigger, run(), NOW, "felipe")).toBeNull();
});

test("an edit after the run started, or a moved model or provider, earns no snooze", () => {
  expect(
    snoozeAfterRun(routine({ updated_at: NOW }), run(), NOW, "felipe"),
  ).toBeNull();
  expect(
    snoozeAfterRun(routine({ model: "claude-sonnet-5" }), run(), NOW, "felipe"),
  ).toBeNull();
  expect(
    snoozeAfterRun(routine({ provider: "openai" }), run(), NOW, "felipe"),
  ).toBeNull();
  expect(
    snoozeAfterRun(routine({ enabled: false }), run(), NOW, "felipe"),
  ).toBeNull();
});

test("only a usage limit snoozes, and a longer hold is kept", () => {
  expect(
    snoozeAfterRun(
      routine(),
      run({ failure: { code: "out_of_credits", provider: "anthropic" } }),
      NOW,
      "felipe",
    ),
  ).toBeNull();
  const held = routine({
    snoozed: {
      reason: "usage_limit",
      provider: "anthropic",
      model: null,
      until: "2026-10-20T00:00:00.000Z",
      at: NOW,
    },
  });
  expect(snoozeAfterRun(held, run(), NOW, "felipe")).toBeNull();
});

test("a reset implausibly far out holds at most eight days", () => {
  const far = new Date(9999999999999).toISOString();
  expect(routineSnooze({ ...LIMIT, resets_at: far }, NOW)?.until).toBe(
    new Date(Date.parse(NOW) + USAGE_LIMIT_MAX_SNOOZE_MS).toISOString(),
  );
});

test("a run that answered on the creator's account lifts the snooze", () => {
  const snooze = routineSnooze(LIMIT, NOW);
  if (!snooze) throw new Error("expected a snooze");
  const held = snoozeRoutine(routine(), snooze);
  for (const status of ["silent", "surfaced"] as const) {
    const lifted = unsnoozeAfterRun(
      held,
      run({ status, failure: undefined }),
      "felipe",
    );
    expect(lifted).not.toBeNull();
    expect(lifted?.snoozed).toBeUndefined();
    expect(lifted?.updated_at).toBe(held.updated_at);
  }
  expect(unsnoozeAfterRun(held, run(), "felipe")).toBeNull();
  expect(
    unsnoozeAfterRun(
      held,
      run({ status: "silent", failure: undefined }),
      "julia",
    ),
  ).toBeNull();
  expect(
    unsnoozeAfterRun(routine(), run({ status: "silent", failure: undefined })),
  ).toBeNull();
});

test("a legacy pin is read through the same mapping its fires get", () => {
  const fable = run({ failure: { ...LIMIT, model: "claude-fable-5-2" } });
  // A Rust-era "claude" pin with a bare "fable" alias runs anthropic's Fable.
  expect(
    snoozeAfterRun(
      routine({ provider: "claude", model: "fable" }),
      fable,
      NOW,
      "felipe",
    ),
  ).not.toBeNull();
  // The same legacy pin on another model is no longer behind the limit.
  expect(
    snoozeAfterRun(
      routine({ provider: "claude", model: "sonnet" }),
      fable,
      NOW,
      "felipe",
    ),
  ).toBeNull();
});

test("without an acting user, only a scheduled row counts as the creator's", () => {
  // The standing host: a "Run now" row ran as whoever pressed it.
  expect(snoozeAfterRun(routine(), run({ manual: true }), NOW)).toBeNull();
  const snooze = routineSnooze(LIMIT, NOW);
  if (!snooze) throw new Error("expected a snooze");
  const held = snoozeRoutine(routine(), snooze);
  const answered = run({ status: "silent", failure: undefined });
  expect(unsnoozeAfterRun(held, { ...answered, manual: true })).toBeNull();
  expect(unsnoozeAfterRun(held, answered)).not.toBeNull();
});
