import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import {
  orgChartBarPercent,
  orgChartCardOrder,
  orgChartScale,
  orgChartUsageState,
} from "../src/components/organization/org-chart-view-model.ts";

test("usage is hidden outright for a caller who may not read it", () => {
  strictEqual(
    orgChartUsageState({ permitted: false, isLoading: true, isError: false }),
    "hidden",
  );
  strictEqual(
    orgChartUsageState({ permitted: false, isLoading: false, isError: true }),
    "hidden",
  );
});

test("a permitted caller sees loading, then the failure, then the numbers", () => {
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: true, isError: false }),
    "loading",
  );
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: false, isError: true }),
    "error",
  );
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: false, isError: false }),
    "ready",
  );
});

test("No team card comes before folder cards", () => {
  deepStrictEqual(orgChartCardOrder(2, ["a", "b"]), [null, "a", "b"]);
  deepStrictEqual(orgChartCardOrder(0, ["a"]), ["a"]);
});

test("every bar is scaled to the busiest agent in the whole chart", () => {
  strictEqual(
    orgChartScale(
      new Map([
        ["a", 4],
        ["b", 40],
      ]),
    ),
    40,
  );
  // A silent org must not divide by zero.
  strictEqual(orgChartScale(new Map([["a", 0]])), 1);
  strictEqual(orgChartScale(new Map()), 1);
});

test("a silent agent's bar is empty and a trickle still shows", () => {
  strictEqual(orgChartBarPercent(0, 40), 0);
  strictEqual(orgChartBarPercent(-3, 40), 0);
  strictEqual(orgChartBarPercent(1, 400), 2);
  strictEqual(orgChartBarPercent(20, 40), 50);
  strictEqual(orgChartBarPercent(40, 40), 100);
  // A stale scale (one card rendered against an older max) still clamps.
  strictEqual(orgChartBarPercent(80, 40), 100);
});
