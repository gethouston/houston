import type {
  ProviderError,
  Routine,
  RoutineRun,
  RoutineRunFailure,
} from "@houston/protocol";
import { expect, test } from "vitest";
import {
  ROUTINE_AUTO_PAUSE_AFTER,
  routineAutoPause,
  routineRunFailure,
} from "./routine-auto-pause";
import { applyRoutineUpdate, createRoutine } from "./routine-edit";
import {
  routineSnooze,
  routineSnoozeLogTail,
  snoozeRoutine,
  USAGE_LIMIT_UNKNOWN_RESET_MS,
} from "./routine-snooze";
import { dueAt } from "./schedule";

const EDITED = "2026-09-01T00:00:00.000Z";
const NOW = "2026-10-09T12:00:00.000Z";
const RESET = "2026-10-13T05:00:00.000Z";

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Signups", prompt: "check", schedule: "*/5 * * * *" },
    "r1",
    EDITED,
  ),
  ...over,
});

const limited = (resets_at: string | null = RESET): ProviderError => ({
  kind: "usage_limit_paused",
  provider: "anthropic",
  model: "claude-fable-5",
  resets_at,
  message: "You've reached your Fable limit.",
});

const USAGE_LIMIT: Extract<RoutineRunFailure, { code: "usage_limit" }> = {
  code: "usage_limit",
  provider: "anthropic",
  model: "claude-fable-5",
  resets_at: RESET,
};
const NO_CREDITS: RoutineRunFailure = {
  code: "out_of_credits",
  provider: "anthropic",
};

function errors(failures: RoutineRunFailure[]): RoutineRun[] {
  const base = Date.parse(EDITED) + 60_000;
  return failures
    .map(
      (failure, i): RoutineRun => ({
        id: `run-${i}`,
        routine_id: "r1",
        status: "error",
        session_key: "routine-r1",
        started_at: new Date(base + i * 60_000).toISOString(),
        failure,
      }),
    )
    .reverse();
}

test("a usage-limit provider error is the typed usage_limit failure with its reset", () => {
  expect(routineRunFailure(limited())).toEqual(USAGE_LIMIT);
  expect(routineRunFailure(limited(null))).toEqual({
    ...USAGE_LIMIT,
    resets_at: null,
  });
});

test("a short rate limit still has no typed failure", () => {
  expect(
    routineRunFailure({
      kind: "rate_limited",
      provider: "anthropic",
      model: null,
      retry_after_seconds: 30,
      message: "429",
    }),
  ).toBeUndefined();
});

test("usage-limit runs never count toward an auto-pause and never end a streak", () => {
  const N = ROUTINE_AUTO_PAUSE_AFTER;
  expect(
    routineAutoPause(
      routine(),
      errors(Array.from({ length: N * 2 }, () => USAGE_LIMIT)),
      NOW,
    ),
  ).toBeNull();
  const interleaved: RoutineRunFailure[] = Array.from(
    { length: N },
    () => NO_CREDITS,
  );
  interleaved.splice(3, 0, USAGE_LIMIT);
  expect(routineAutoPause(routine(), errors(interleaved), NOW)).toMatchObject({
    reason: "out_of_credits",
    failures: N,
  });
});

test("the snooze lasts until the provider's reset", () => {
  expect(routineSnooze(USAGE_LIMIT, NOW)).toEqual({
    reason: "usage_limit",
    provider: "anthropic",
    model: "claude-fable-5",
    until: RESET,
    at: NOW,
  });
});

test("an unknown or already-past reset snoozes for the bounded wait", () => {
  const bounded = new Date(
    Date.parse(NOW) + USAGE_LIMIT_UNKNOWN_RESET_MS,
  ).toISOString();
  expect(routineSnooze({ ...USAGE_LIMIT, resets_at: null }, NOW)?.until).toBe(
    bounded,
  );
  expect(
    routineSnooze({ ...USAGE_LIMIT, resets_at: "not a time" }, NOW)?.until,
  ).toBe(bounded);
  expect(routineSnooze({ ...USAGE_LIMIT, resets_at: EDITED }, NOW)?.until).toBe(
    bounded,
  );
});

test("only a usage-limit failure snoozes", () => {
  expect(routineSnooze(NO_CREDITS, NOW)).toBeNull();
  expect(routineSnooze({ code: "no_model" }, NOW)).toBeNull();
});

test("snoozing leaves the routine enabled and its edit time alone", () => {
  const snooze = routineSnooze(USAGE_LIMIT, NOW);
  if (!snooze) throw new Error("expected a snooze");
  const snoozed = snoozeRoutine(routine(), snooze);
  expect(snoozed.enabled).toBe(true);
  expect(snoozed.updated_at).toBe(EDITED);
  expect(snoozed.snoozed).toEqual(snooze);
  expect(routineSnoozeLogTail(snooze)).toBe(
    `usage_limit (anthropic claude-fable-5) until ${RESET}`,
  );
});

test("a snoozed routine is not due until its snooze ends", () => {
  const snoozed = snoozeRoutine(routine(), {
    reason: "usage_limit",
    provider: "anthropic",
    model: null,
    until: "2026-10-09T12:07:30.000Z",
    at: NOW,
  });
  const since = new Date("2026-10-09T11:59:00.000Z");
  expect(dueAt(snoozed, since, new Date("2026-10-09T12:06:00Z"), "UTC")).toBe(
    null,
  );
  expect(
    dueAt(snoozed, since, new Date("2026-10-09T12:11:00Z"), "UTC"),
  ).toEqual(new Date("2026-10-09T12:10:00.000Z"));
  const atEdge = snoozeRoutine(routine(), {
    reason: "usage_limit",
    provider: "anthropic",
    model: null,
    until: "2026-10-09T12:05:00.000Z",
    at: NOW,
  });
  expect(dueAt(atEdge, since, new Date("2026-10-09T12:11:00Z"), "UTC")).toEqual(
    new Date("2026-10-09T12:05:00.000Z"),
  );
  expect(
    dueAt(routine(), since, new Date("2026-10-09T12:06:00Z"), "UTC"),
  ).toEqual(new Date("2026-10-09T12:00:00.000Z"));
});

test("changing the model or provider, or resuming, clears the snooze; a rename keeps it", () => {
  const snoozed = snoozeRoutine(routine(), {
    reason: "usage_limit",
    provider: "anthropic",
    model: "claude-fable-5",
    until: RESET,
    at: NOW,
  });
  expect(
    applyRoutineUpdate(snoozed, { model: "claude-sonnet-4-5" }, NOW).snoozed,
  ).toBeUndefined();
  expect(
    applyRoutineUpdate(snoozed, { provider: "openai" }, NOW).snoozed,
  ).toBeUndefined();
  expect(
    applyRoutineUpdate(snoozed, { enabled: true }, NOW).snoozed,
  ).toBeUndefined();
  expect(applyRoutineUpdate(snoozed, { name: "Renamed" }, NOW).snoozed).toEqual(
    snoozed.snoozed,
  );
  const update = { name: "x", snoozed: snoozed.snoozed };
  expect(applyRoutineUpdate(routine(), update, NOW).snoozed).toBeUndefined();
});
