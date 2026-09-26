import { expect, test } from "vitest";
import { minFireGapMinutes } from "./schedule-gap";

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
});

test("no gap for a pattern that is invalid or never fires twice", () => {
  expect(minFireGapMinutes("not a cron")).toBeNull();
  expect(minFireGapMinutes("0 0 30 2 *")).toBeNull();
});
