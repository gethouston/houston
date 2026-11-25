import {
  autoPauseRoutine,
  createRoutine,
  ROUTINE_AUTO_PAUSE_AFTER,
  ROUTINE_PROVIDER_ERROR_PAUSE_AFTER,
  routineAutoPause,
  unconnectedRoutineFailure,
} from "@houston/domain";
import type { RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import { routinePauseNotice } from "../src/modules/routines/auto-pause";
import * as main from "./fixtures/routine-pause-main";

const NOW = "2026-10-06T12:00:00.000Z";
const routine = createRoutine(
  { name: "Inbox sweep", prompt: "check", schedule: "*/15 * * * *" },
  "r1",
  "2026-10-01T00:00:00.000Z",
);
const failure = unconnectedRoutineFailure(null);
const runs: RoutineRun[] = Array.from(
  { length: ROUTINE_AUTO_PAUSE_AFTER },
  (_, i) => ({
    id: `run-${i}`,
    routine_id: "r1",
    status: "error",
    session_key: "routine-r1",
    failure,
    started_at: new Date(Date.parse(NOW) - (i + 1) * 900_000).toISOString(),
  }),
);
const pause = routineAutoPause(routine, runs, NOW);
if (!pause) throw new Error("the streak should pause");
const paused = autoPauseRoutine(routine, pause);
const wire = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

test("an old client reads a no-model pause as 'change the model' instead of throwing", () => {
  expect(failure).toEqual({ code: "no_model" });
  const old = wire<Parameters<typeof main.routinePauseNotice>[0]>(paused);
  expect(() => main.routinePauseNotice(old)).not.toThrow();
  expect(main.routinePauseNotice(old)).toMatchObject({
    remedy: "change_model",
    failures: ROUTINE_AUTO_PAUSE_AFTER,
  });
  const reader = { provider: "", health: "ok", readerIsCreator: true };
  expect(() => main.routinePauseNotice(old, reader)).not.toThrow();
});

test("an old client reads a no-model run row without throwing", () => {
  const old = wire<Parameters<typeof main.routineFailureCode>[0]>(runs[0]);
  expect(() => main.routineFailureCode(old)).not.toThrow();
  expect(() =>
    main.routineFailureCode(old, (provider) => ({
      provider,
      readerIsCreator: true,
    })),
  ).not.toThrow();
});

test("this client reads the same pause as 'choose a model', naming no provider", () => {
  expect(routinePauseNotice(wire(paused))).toEqual({
    remedy: "choose_model",
    failures: ROUTINE_AUTO_PAUSE_AFTER,
    pausedAt: NOW,
  });
});

test("an old client reads a creator-access row as an unnamed code", () => {
  const refused = wire<Parameters<typeof main.routineFailureCode>[0]>({
    ...runs[0],
    failure: undefined,
    delivery_failure: { code: "creator_no_access" },
  });
  expect(() => main.routineFailureCode(refused)).not.toThrow();
  expect(main.routineFailureCode(refused)).toBe("creator_no_access");
});

test("an old client reads an untyped provider-error pause as 'change the model' and its rows as an unnamed code", () => {
  const untyped = { code: "provider_error" as const, provider: "nvidia" };
  const rows: RoutineRun[] = runs
    .slice(0, ROUTINE_PROVIDER_ERROR_PAUSE_AFTER)
    .map((run) => ({ ...run, failure: untyped }));
  const earned = routineAutoPause(routine, rows, NOW);
  if (!earned) throw new Error("the untyped streak should pause");
  const old = wire<Parameters<typeof main.routinePauseNotice>[0]>(
    autoPauseRoutine(routine, earned),
  );
  expect(() => main.routinePauseNotice(old)).not.toThrow();
  expect(main.routinePauseNotice(old)).toMatchObject({
    remedy: "change_model",
    provider: "nvidia",
    failures: ROUTINE_PROVIDER_ERROR_PAUSE_AFTER,
  });
  const row = wire<Parameters<typeof main.routineFailureCode>[0]>(rows[0]);
  expect(() => main.routineFailureCode(row)).not.toThrow();
  expect(main.routineFailureCode(row)).toBe("provider_error");
});
