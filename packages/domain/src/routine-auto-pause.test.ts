import type {
  ProviderError,
  Routine,
  RoutineRun,
  RoutineRunFailure,
} from "@houston/protocol";
import { expect, test } from "vitest";
import {
  autoPauseRoutine,
  ROUTINE_AUTO_PAUSE_AFTER,
  routineAutoPause,
  routineRunFailure,
} from "./routine-auto-pause";
import { applyRoutineUpdate, createRoutine } from "./routines";

const EDITED = "2026-09-01T00:00:00.000Z";
const NOW = "2026-09-29T12:00:00.000Z";
const N = ROUTINE_AUTO_PAUSE_AFTER;

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Every minute", prompt: "check", schedule: "* * * * *" },
    "r1",
    EDITED,
  ),
  ...over,
});

const NO_CREDITS: RoutineRunFailure = {
  code: "out_of_credits",
  provider: "anthropic",
};
const BAD_MODEL: RoutineRunFailure = {
  code: "model_unavailable",
  provider: "anthropic",
};

type Outcome =
  | RoutineRunFailure
  | "ok"
  | "transient"
  | "cancelled"
  | "undelivered";

function history(outcomes: Outcome[], routineId = "r1"): RoutineRun[] {
  const base = Date.parse(EDITED) + 60_000;
  return outcomes
    .map((outcome, i): RoutineRun => {
      const run: RoutineRun = {
        id: `run-${i}`,
        routine_id: routineId,
        status: "silent",
        session_key: `routine-${routineId}`,
        started_at: new Date(base + i * 60_000).toISOString(),
      };
      if (outcome === "ok") return run;
      if (outcome === "cancelled") return { ...run, status: "cancelled" };
      if (outcome === "transient")
        return { ...run, status: "error", summary: "timed out" };
      if (outcome === "undelivered")
        return {
          ...run,
          status: "error",
          session_key: "",
          summary:
            "The routine could not start before its delivery deadline. Retry the routine.",
          delivery_failure: { code: "pool_delivery_expired" },
        };
      return { ...run, status: "error", failure: outcome };
    })
    .reverse();
}

const times = (n: number, outcome: Outcome): Outcome[] =>
  Array.from({ length: n }, () => outcome);

test("N consecutive same-kind user-fixable failures pause the routine", () => {
  expect(
    routineAutoPause(routine(), history(times(N - 1, NO_CREDITS)), NOW),
  ).toBeNull();
  expect(
    routineAutoPause(routine(), history(times(N, NO_CREDITS)), NOW),
  ).toEqual({
    reason: "out_of_credits",
    provider: "anthropic",
    failures: N,
    at: NOW,
  });
});

test("transient errors and stopped runs neither count nor reset the streak", () => {
  const outcomes = times(N, NO_CREDITS).flatMap((f) => [
    f,
    "transient" as const,
    "cancelled" as const,
  ]);
  expect(routineAutoPause(routine(), history(outcomes), NOW)?.failures).toBe(N);
  expect(
    routineAutoPause(
      routine(),
      history([...times(N - 1, NO_CREDITS), ...times(20, "transient")]),
      NOW,
    ),
  ).toBeNull();
});

test("delivery failures are our capacity problem: they never pause, count or reset", () => {
  expect(
    routineAutoPause(routine(), history(times(3 * N, "undelivered")), NOW),
  ).toBeNull();
  const interleaved = times(N, NO_CREDITS).flatMap((f) => [
    f,
    "undelivered" as const,
  ]);
  expect(routineAutoPause(routine(), history(interleaved), NOW)).toEqual({
    reason: "out_of_credits",
    provider: "anthropic",
    failures: N,
    at: NOW,
  });
  expect(
    routineAutoPause(
      routine(),
      history([...times(N - 1, NO_CREDITS), ...times(N, "undelivered")]),
      NOW,
    ),
  ).toBeNull();
});

test("a run that answered resets the streak", () => {
  const outcomes = [...times(N - 1, NO_CREDITS), "ok" as const, NO_CREDITS];
  expect(routineAutoPause(routine(), history(outcomes), NOW)).toBeNull();
});

test("a different wall restarts the count", () => {
  const outcomes = [...times(N - 1, BAD_MODEL), ...times(N - 1, NO_CREDITS)];
  expect(routineAutoPause(routine(), history(outcomes), NOW)).toBeNull();
  const other = { code: "out_of_credits", provider: "openai" } as const;
  expect(
    routineAutoPause(
      routine(),
      history([...times(N - 1, NO_CREDITS), other]),
      NOW,
    ),
  ).toBeNull();
});

test("only the routine's own runs, and only runs since its last edit, count", () => {
  expect(
    routineAutoPause(routine(), history(times(N, NO_CREDITS), "r2"), NOW),
  ).toBeNull();
  const editedAfter = routine({ updated_at: "2026-09-02T00:00:00.000Z" });
  expect(
    routineAutoPause(editedAfter, history(times(N, NO_CREDITS)), NOW),
  ).toBeNull();
});

test("a routine that is off, or already auto-paused, earns nothing", () => {
  const runs = history(times(N, NO_CREDITS));
  expect(routineAutoPause(routine({ enabled: false }), runs, NOW)).toBeNull();
  const paused = autoPauseRoutine(routine(), {
    reason: "out_of_credits",
    provider: "anthropic",
    failures: N,
    at: NOW,
  });
  expect(paused).toMatchObject({ enabled: false, updated_at: NOW });
  expect(routineAutoPause(paused, runs, NOW)).toBeNull();
});

test("resuming clears the pause and restarts the count; an update never writes it", () => {
  const pause = {
    reason: "out_of_credits",
    provider: "anthropic",
    failures: N,
    at: NOW,
  } as const;
  const paused = autoPauseRoutine(routine(), pause);
  const renamed = applyRoutineUpdate(paused, { name: "Renamed" }, NOW);
  expect(renamed.auto_paused).toEqual(pause);
  const forged = applyRoutineUpdate(
    routine(),
    { auto_paused: pause } as never,
    NOW,
  );
  expect(forged.auto_paused).toBeUndefined();
  const resumeAt = "2026-09-29T13:00:00.000Z";
  const resumed = applyRoutineUpdate(paused, { enabled: true }, resumeAt);
  expect(resumed).toMatchObject({ enabled: true, updated_at: resumeAt });
  expect(resumed.auto_paused).toBeUndefined();
  expect(
    routineAutoPause(resumed, history(times(N, NO_CREDITS)), NOW),
  ).toBeNull();
});

test("only walls a person has to clear map to a typed failure", () => {
  const base = { provider: "anthropic", message: "x" };
  const cases: [ProviderError, RoutineRunFailure["code"] | undefined][] = [
    [
      {
        ...base,
        kind: "quota_exhausted",
        model: null,
        scope: "paid_plan",
        resets_at: null,
      },
      "out_of_credits",
    ],
    [
      {
        ...base,
        kind: "model_unavailable",
        model: "m",
        reason: "unknown",
        suggested_fallback: null,
      },
      "model_unavailable",
    ],
    [
      { ...base, kind: "unauthenticated", cause: "no_credentials" },
      "creator_not_connected",
    ],
    [
      {
        ...base,
        kind: "unauthenticated",
        cause: "token_expired",
        credential: { scope: "team" },
      } as ProviderError,
      "team_needs_reconnect",
    ],
    [
      { ...base, kind: "rate_limited", model: null, retry_after_seconds: 30 },
      undefined,
    ],
    [{ ...base, kind: "provider_internal", http_status: 529 }, undefined],
    [{ ...base, kind: "network_unreachable" }, undefined],
    [
      {
        ...base,
        kind: "context_overflow",
        model: null,
        context_window_tokens: null,
        prompt_tokens: null,
      },
      undefined,
    ],
  ];
  for (const [err, code] of cases)
    expect(routineRunFailure(err)?.code).toBe(code);
});
