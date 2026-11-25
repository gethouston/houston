import type { RoutineRun, RoutineRunFailure } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  ROUTINE_AUTO_PAUSE_AFTER,
  ROUTINE_PROVIDER_ERROR_PAUSE_AFTER,
  routineAutoPause,
  routineAutoPauseLogTail,
  routineFailureProvider,
  routineRunFailure,
} from "./routine-auto-pause";
import { createRoutine } from "./routines";

const EDITED = "2026-11-18T00:00:00.000Z";
const NOW = "2026-11-22T12:00:00.000Z";
const N = ROUTINE_PROVIDER_ERROR_PAUSE_AFTER;
const routine = createRoutine(
  { name: "Every 15 minutes", prompt: "check", schedule: "*/15 * * * *" },
  "r1",
  EDITED,
);
const UNTYPED: RoutineRunFailure = {
  code: "provider_error",
  provider: "nvidia",
};

function history(outcomes: (RoutineRunFailure | "ok" | "transient")[]) {
  const base = Date.parse(EDITED) + 60_000;
  return outcomes
    .map((outcome, i): RoutineRun => {
      const run: RoutineRun = {
        id: `run-${i}`,
        routine_id: "r1",
        status: "silent",
        session_key: "routine-r1",
        started_at: new Date(base + i * 900_000).toISOString(),
      };
      if (outcome === "ok") return run;
      if (outcome === "transient")
        return { ...run, status: "error", summary: "529 overloaded" };
      return { ...run, status: "error", failure: outcome };
    })
    .reverse();
}

const times = <T>(n: number, value: T): T[] =>
  Array.from({ length: n }, () => value);

test("an unknown provider error is typed as the provider's untyped failure", () => {
  expect(
    routineRunFailure({
      kind: "unknown",
      provider: "nvidia",
      raw_excerpt: "x",
    }),
  ).toEqual(UNTYPED);
});

test("the untyped streak pauses sooner than a typed wall, under an account reason old clients render", () => {
  expect(N).toBeLessThan(ROUTINE_AUTO_PAUSE_AFTER);
  expect(routineAutoPause(routine, history(times(N - 1, UNTYPED)), NOW)).toBe(
    null,
  );
  const pause = routineAutoPause(routine, history(times(N, UNTYPED)), NOW);
  expect(pause).toEqual({
    reason: "model_unavailable",
    provider: "nvidia",
    cause: "provider_error",
    failures: N,
    at: NOW,
  });
  if (!pause) throw new Error("expected a pause");
  expect(routineFailureProvider(pause)).toBe("nvidia");
  expect(routineAutoPauseLogTail(pause)).toBe(
    `${N} runs: provider_error (nvidia)`,
  );
});

test("a reply, another provider or a typed wall breaks the untyped streak", () => {
  const recovered = [...times(N - 1, UNTYPED), "ok" as const, UNTYPED];
  expect(routineAutoPause(routine, history(recovered), NOW)).toBeNull();
  const otherProvider = [
    ...times(N - 1, UNTYPED),
    { code: "provider_error", provider: "openai" } as const,
  ];
  expect(routineAutoPause(routine, history(otherProvider), NOW)).toBeNull();
  const typed = [
    ...times(N - 1, UNTYPED),
    { code: "model_unavailable", provider: "nvidia" } as const,
  ];
  expect(routineAutoPause(routine, history(typed), NOW)).toBeNull();
});

test("transient provider errors between untyped ones neither count nor break the streak", () => {
  const outcomes = times(N, UNTYPED).flatMap((f) => [f, "transient" as const]);
  expect(routineAutoPause(routine, history(outcomes), NOW)?.failures).toBe(N);
});
