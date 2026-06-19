import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { effortBars, effortFillCount, EFFORT_ICON_VIEWBOX } from "../src/lib/effort-bars.ts";

// Opus accepts all five; Codex stops at xhigh and has no max level.
const FIVE = ["low", "medium", "high", "xhigh", "max"] as const;
const FOUR = ["low", "medium", "high", "xhigh"] as const;

describe("effortFillCount", () => {
  it("is the 1-based position of the active level", () => {
    strictEqual(effortFillCount(FIVE, "low"), 1);
    strictEqual(effortFillCount(FIVE, "high"), 3);
    strictEqual(effortFillCount(FIVE, "max"), 5);
    strictEqual(effortFillCount(FOUR, "xhigh"), 4);
  });

  it("is 0 when the level is absent, unset, or the set is empty", () => {
    strictEqual(effortFillCount(FOUR, "max"), 0);
    strictEqual(effortFillCount(FIVE, undefined), 0);
    strictEqual(effortFillCount(FIVE, null), 0);
    strictEqual(effortFillCount([], "low"), 0);
  });
});

describe("effortBars", () => {
  it("emits one bar per level", () => {
    strictEqual(effortBars(FIVE, "high").length, 5);
    strictEqual(effortBars(FOUR, "high").length, 4);
    deepStrictEqual(effortBars([], "low"), []);
  });

  it("fills bars up to and including the active level", () => {
    deepStrictEqual(
      effortBars(FIVE, "high").map((bar) => bar.filled),
      [true, true, true, false, false],
    );
    deepStrictEqual(
      effortBars(FOUR, "xhigh").map((bar) => bar.filled),
      [true, true, true, true],
    );
  });

  it("leaves every bar dimmed when nothing is selected", () => {
    deepStrictEqual(
      effortBars(FIVE, undefined).map((bar) => bar.filled),
      [false, false, false, false, false],
    );
  });

  it("ascends in height from left to right", () => {
    const bars = effortBars(FIVE, "max");
    for (let i = 1; i < bars.length; i++) {
      strictEqual(bars[i].height > bars[i - 1].height, true);
    }
  });

  it("centers the bar group within the viewBox", () => {
    const bars = effortBars(FOUR, "low");
    const left = bars[0].x;
    const last = bars[bars.length - 1];
    const right = EFFORT_ICON_VIEWBOX - (last.x + last.width);
    strictEqual(Math.abs(left - right) < 1e-9, true);
  });

  it("keeps every bar inside the viewBox", () => {
    for (const levels of [FOUR, FIVE]) {
      for (const bar of effortBars(levels, "high")) {
        strictEqual(bar.x >= 0, true);
        strictEqual(bar.x + bar.width <= EFFORT_ICON_VIEWBOX, true);
        strictEqual(bar.y >= 0, true);
        strictEqual(bar.y + bar.height <= EFFORT_ICON_VIEWBOX, true);
      }
    }
  });
});
