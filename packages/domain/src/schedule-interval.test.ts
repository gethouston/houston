import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Routine } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import { createRoutine } from "./routines";
import { dueAt, nextRun, validateSchedule } from "./schedule";
import { minFireGapMinutes } from "./schedule-gap";
import {
  canonicalSchedule,
  type IntervalScheduleUnit,
  intervalSchedule,
  parseIntervalSchedule,
} from "./schedule-interval";

interface Fixtures {
  canonical: { every: number; unit: IntervalScheduleUnit; schedule: string }[];
  parse: {
    schedule: string;
    interval: { every: number; unit: IntervalScheduleUnit } | null;
  }[];
  canonicalize: { schedule: string; canonical: string }[];
  next: { schedule: string; after: string; next: string | null }[];
}

const fixturePath = (rel: string) =>
  fileURLToPath(new URL(rel, import.meta.url));
const OWN = fixturePath("./schedule-interval.fixtures.json");
const UI_TWIN = fixturePath(
  "../../../ui/routines/tests/schedule-interval.fixtures.json",
);
const fixtures = JSON.parse(readFileSync(OWN, "utf8")) as Fixtures;

const at = (iso: string) => new Date(iso);

test("the ui/routines copy of the fixture table is identical", () => {
  expect(readFileSync(UI_TWIN, "utf8")).toBe(readFileSync(OWN, "utf8"));
});

describe("intervalSchedule canonicalizes every fixture row", () => {
  test.each(fixtures.canonical)("$every $unit -> $schedule", (row) => {
    expect(intervalSchedule(row.every, row.unit)).toBe(row.schedule);
  });
});

describe("parseIntervalSchedule reads every fixture row", () => {
  test.each(fixtures.parse)("'$schedule'", (row) => {
    const parsed = parseIntervalSchedule(row.schedule);
    expect(parsed && { every: parsed.every, unit: parsed.unit }).toEqual(
      row.interval,
    );
  });
});

describe("canonicalSchedule rewrites every fixture row", () => {
  test.each(fixtures.canonicalize)("'$schedule' -> '$canonical'", (row) => {
    expect(canonicalSchedule(row.schedule)).toBe(row.canonical);
  });
});

describe("nextRun follows the epoch grid in every fixture row", () => {
  test.each(fixtures.next)("$schedule after $after", (row) => {
    for (const tz of ["UTC", "Asia/Kolkata", null]) {
      expect(
        nextRun(row.schedule, tz, at(row.after))?.toISOString() ?? null,
      ).toBe(row.next);
    }
  });
});

test("validateSchedule accepts intervals and names what is wrong otherwise", () => {
  expect(validateSchedule("@every 16m")).toBeNull();
  expect(validateSchedule("@every 5h", "America/Bogota")).toBeNull();
  expect(validateSchedule("@every 1h30m")).toMatch(/90m, not 1h30m/);
  expect(validateSchedule("@every 0m")).toMatch(/one whole number/);
  expect(validateSchedule("@every soon")).toMatch(/one whole number/);
  expect(validateSchedule("@every 10081m")).toMatch(/at most 7 days/);
  expect(validateSchedule("@every 169h")).toMatch(/at most 7 days/);
});

test("every 16 minutes keeps its cadence across the hour: :48 -> :04", () => {
  const fire = nextRun("@every 16m", "UTC", at("2026-06-12T12:48:00.000Z"));
  expect(fire?.toISOString()).toBe("2026-06-12T13:04:00.000Z");
  const later = nextRun("@every 16m", "UTC", at("2026-06-12T12:50:10.000Z"));
  expect(later?.toISOString()).toBe("2026-06-12T13:04:00.000Z");
  const after = nextRun("@every 16m", "UTC", at("2026-06-12T13:04:00.000Z"));
  expect(after?.toISOString()).toBe("2026-06-12T13:20:00.000Z");
});

test("nextRun is strictly after `after` and sits on the epoch grid", () => {
  expect(nextRun("@every 1m", null, at("1970-01-01T00:00:00.000Z"))).toEqual(
    at("1970-01-01T00:01:00.000Z"),
  );
  expect(
    nextRun("@every 5h", null, at("2026-06-12T00:00:00.000Z"))?.toISOString(),
  ).toBe("2026-06-12T01:00:00.000Z");
  expect(
    nextRun("@every 5h", null, at("2026-06-12T01:00:00.000Z"))?.toISOString(),
  ).toBe("2026-06-12T06:00:00.000Z");
});

test("the account timezone never moves the interval grid", () => {
  const after = at("2026-06-12T12:48:00.000Z");
  for (const tz of ["UTC", "Asia/Kolkata", "America/Bogota", null]) {
    expect(nextRun("@every 16m", tz, after)?.toISOString()).toBe(
      "2026-06-12T13:04:00.000Z",
    );
  }
});

test("an invalid interval never fires", () => {
  expect(nextRun("@every 1h30m", "UTC", at("2026-06-12T13:48:00Z"))).toBeNull();
  expect(nextRun("@every 0m", "UTC", at("2026-06-12T13:48:00Z"))).toBeNull();
});

test("dueAt fires an interval routine once per window, at the grid instant", () => {
  const routine: Routine = createRoutine(
    { name: "R", prompt: "p", schedule: "@every 16m" },
    "r1",
    "2026-06-12T12:00:00.000Z",
  );
  const since = at("2026-06-12T13:03:30.000Z");
  expect(
    dueAt(routine, since, at("2026-06-12T13:04:10.000Z"), "UTC")?.toISOString(),
  ).toBe("2026-06-12T13:04:00.000Z");
  expect(dueAt(routine, since, at("2026-06-12T13:03:59.000Z"), "UTC")).toBe(
    null,
  );
});

test("an interval's fire gap is its step", () => {
  expect(minFireGapMinutes("@every 16m")).toBe(16);
  expect(minFireGapMinutes("@every 5h")).toBe(300);
  expect(minFireGapMinutes("@every 1h30m")).toBeNull();
});

test("canonicalSchedule rewrites even intervals to cron and leaves the rest", () => {
  expect(canonicalSchedule("@every 30m")).toBe("*/30 * * * *");
  expect(canonicalSchedule("@every 2h")).toBe("0 */2 * * *");
  expect(canonicalSchedule("@every 120m")).toBe("0 */2 * * *");
  expect(canonicalSchedule(" @every 16m ")).toBe("@every 16m");
  expect(canonicalSchedule("@every 5h")).toBe("@every 5h");
  expect(canonicalSchedule("*/16 * * * *")).toBe("*/16 * * * *");
  expect(canonicalSchedule("@every 1h30m")).toBe("@every 1h30m");
});
