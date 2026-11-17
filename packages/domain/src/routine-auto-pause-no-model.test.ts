import type { Routine, RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  ROUTINE_AUTO_PAUSE_AFTER,
  routineAutoPause,
  routineAutoPauseLogTail,
  routineFailureProvider,
  unconnectedRoutineFailure,
} from "./routine-auto-pause";
import { createRoutine } from "./routines";

// PRODUCT-1982: an unpinned routine refused for "nothing connected" has no
// provider to blame, and still has to stop at the same pause as a pinned one.

const EDITED = "2026-09-01T00:00:00.000Z";
const NOW = "2026-09-29T12:00:00.000Z";
const N = ROUTINE_AUTO_PAUSE_AFTER;

const routine = (over: Partial<Routine> = {}): Routine => ({
  ...createRoutine(
    { name: "Every 15 min", prompt: "check", schedule: "*/15 * * * *" },
    "r1",
    EDITED,
  ),
  ...over,
});

/** `failures` newest first, one minute apart after the routine's edit. */
const runs = (failures: RoutineRun["failure"][]): RoutineRun[] =>
  failures
    .map(
      (failure, i): RoutineRun => ({
        id: `run-${i}`,
        routine_id: "r1",
        status: "error",
        session_key: "routine-r1",
        started_at: new Date(
          Date.parse(EDITED) + (i + 1) * 60_000,
        ).toISOString(),
        ...(failure ? { failure } : {}),
      }),
    )
    .reverse();

test("an unconnected fire blames the pinned provider, or names no model", () => {
  expect(unconnectedRoutineFailure("anthropic")).toEqual({
    code: "creator_not_connected",
    provider: "anthropic",
  });
  expect(unconnectedRoutineFailure(null)).toEqual({ code: "no_model" });
  expect(unconnectedRoutineFailure(undefined)).toEqual({ code: "no_model" });
  expect(unconnectedRoutineFailure("")).toEqual({ code: "no_model" });
});

test("N no-model refusals in a row pause the routine with no provider named", () => {
  const noModel = { code: "no_model" } as const;
  expect(
    routineAutoPause(
      routine(),
      runs(Array.from({ length: N - 1 }, () => ({ ...noModel }))),
      NOW,
    ),
  ).toBeNull();
  const pause = routineAutoPause(
    routine(),
    runs(Array.from({ length: N }, () => ({ ...noModel }))),
    NOW,
  );
  // An account reason old clients can render, with the real cause beside it.
  expect(pause).toEqual({
    reason: "model_unavailable",
    provider: "",
    cause: "no_model",
    failures: N,
    at: NOW,
  });
  expect(pause && routineFailureProvider(pause)).toBeUndefined();
  expect(routineAutoPauseLogTail(pause ?? undefined)).toBe(
    `${N} runs: no_model`,
  );
});

test("a no-model refusal and a named-account refusal are different walls", () => {
  const named = {
    code: "creator_not_connected",
    provider: "anthropic",
  } as const;
  const mixed = [
    ...Array.from({ length: N - 1 }, () => ({ ...named })),
    { code: "no_model" } as const,
  ];
  expect(routineAutoPause(routine(), runs(mixed), NOW)).toBeNull();
  expect(
    routineAutoPauseLogTail({
      reason: "creator_not_connected",
      provider: "anthropic",
      failures: N,
      at: NOW,
    }),
  ).toBe(`${N} runs: creator_not_connected (anthropic)`);
});
