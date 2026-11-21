import type { RoutineRun } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  holdsRoutineBusy,
  ROUTINE_RUN_TIMEOUT_MS,
} from "./routine-run-in-flight";
import { RESUME_MAX_AGE_MS } from "./turn-resume-age";

const START = Date.parse("2026-09-30T10:00:00.000Z");
const run = (status: RoutineRun["status"], startedAt = new Date(START)) =>
  ({
    id: "run-1",
    routine_id: "r1",
    status,
    session_key: "routine-r1",
    started_at: startedAt.toISOString(),
  }) as RoutineRun;

test("a running run holds its routine until the run timeout, then not", () => {
  expect(holdsRoutineBusy(run("running"), START)).toBe(true);
  expect(
    holdsRoutineBusy(run("running"), START + ROUTINE_RUN_TIMEOUT_MS - 1),
  ).toBe(true);
  expect(holdsRoutineBusy(run("running"), START + ROUTINE_RUN_TIMEOUT_MS)).toBe(
    false,
  );
});

test("a settled run never holds its routine", () => {
  for (const status of ["silent", "surfaced", "error", "cancelled"] as const) {
    expect(holdsRoutineBusy(run(status), START)).toBe(false);
  }
});

test("a running row with no readable start never holds its routine", () => {
  const legacy = { ...run("running"), started_at: "" };
  expect(holdsRoutineBusy(legacy, START)).toBe(false);
});

test("a resumed run holds its routine until the latest restart's timeout", () => {
  const resumed = { ...run("running"), resumed: true } as RoutineRun;
  expect(holdsRoutineBusy(resumed, START + ROUTINE_RUN_TIMEOUT_MS + 1)).toBe(
    true,
  );
  const last = START + RESUME_MAX_AGE_MS + ROUTINE_RUN_TIMEOUT_MS;
  expect(holdsRoutineBusy(resumed, last - 1)).toBe(true);
  expect(holdsRoutineBusy(resumed, last)).toBe(false);
});
