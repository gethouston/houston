import { describe, expect, it, test } from "vitest";
import { minFireGapMinutes, scheduleFloorAllows } from "./schedule-gap";

test("the smallest gap between consecutive fires, whatever the cron spelling", () => {
  expect(minFireGapMinutes("* * * * *")).toBe(1);
  expect(minFireGapMinutes("*/5 * * * *")).toBe(5);
  expect(minFireGapMinutes("0-59/5 * * * *")).toBe(5);
  expect(minFireGapMinutes("0,5,10 * * * *")).toBe(5);
  expect(minFireGapMinutes("55,0 * * * *")).toBe(5);
  expect(minFireGapMinutes("0,5 9 * * 1")).toBe(5);
  expect(minFireGapMinutes("*/15 * * * *")).toBe(15);
  expect(minFireGapMinutes("0,20,40 * * * *")).toBe(20);
  expect(minFireGapMinutes("0 9 * * *")).toBe(1440);
  expect(minFireGapMinutes("*/16 * * * *")).toBe(12);
  expect(minFireGapMinutes("0 */5 * * *")).toBe(240);
});

test("no gap for a pattern that is invalid or never fires twice", () => {
  expect(minFireGapMinutes("not a cron")).toBeNull();
  expect(minFireGapMinutes("0 0 30 2 *")).toBeNull();
});

describe("scheduleFloorAllows: the save backstop", () => {
  it("allows anything without a floor", () => {
    expect(scheduleFloorAllows("* * * * *", undefined)).toBe(true);
  });

  it("judges a minute step by its real gap, where the hour restarts it", () => {
    const allowed = [];
    for (let n = 1; n <= 59; n += 1)
      if (scheduleFloorAllows(`*/${n} * * * *`, 15)) allowed.push(n);
    expect(allowed).toEqual([
      15, 20, 21, 22, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
      44, 45,
    ]);
    for (const cron of [
      "*/16 * * * *",
      "*/25 * * * *",
      "*/46 * * * *",
      " */59 * * * * ",
    ])
      expect(scheduleFloorAllows(cron, 15), cron).toBe(false);
    expect(scheduleFloorAllows("*/45 * * * *", 15)).toBe(true);
    expect(scheduleFloorAllows("*/20 * * * *", 30)).toBe(false);
  });

  it("judges every other cron by its smallest real gap", () => {
    for (const cron of [
      "* * * * *",
      "0-59/5 * * * *",
      "0,5,10 * * * *",
      "0,5 9 * * 1",
      "55,0 * * * *",
      "*/5 9 * * *",
    ])
      expect(scheduleFloorAllows(cron, 15), cron).toBe(false);
    for (const cron of [
      "0,20,40 * * * *",
      "0,30 * * * *",
      "0 9 * * 1-5",
      "30 8 1 * *",
    ])
      expect(scheduleFloorAllows(cron, 15), cron).toBe(true);
  });
});

describe("an @every interval's gap is its step", () => {
  it("runs exactly N apart, so the floor judges N itself", () => {
    expect(minFireGapMinutes("@every 16m")).toBe(16);
    expect(minFireGapMinutes("@every 14m")).toBe(14);
    expect(minFireGapMinutes("@every 5h")).toBe(300);
    expect(minFireGapMinutes("@every 1h30m")).toBeNull();
  });

  it("allows 15 minutes or more under Free's floor, and nothing below it", () => {
    for (const schedule of ["@every 15m", "@every 16m", "@every 17m"])
      expect(scheduleFloorAllows(schedule, 15), schedule).toBe(true);
    for (const schedule of ["@every 1m", "@every 10m", "@every 14m"])
      expect(scheduleFloorAllows(schedule, 15), schedule).toBe(false);
    expect(scheduleFloorAllows("*/16 * * * *", 15)).toBe(false);
  });
});
