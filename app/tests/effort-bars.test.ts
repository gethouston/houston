import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  EFFORT_ICON_VIEWBOX,
  effortBars,
  effortFillCount,
} from "../src/lib/effort-bars.ts";

// The full spectrum is four tiers now (low→xhigh); a two-level model (e.g.
// DeepSeek high/xhigh) still renders one bar per level it accepts.
const FULL = ["low", "medium", "high", "xhigh"] as const;
const TWO = ["high", "xhigh"] as const;

describe("effortFillCount", () => {
  it("is the 1-based position of the active level", () => {
    strictEqual(effortFillCount(FULL, "low"), 1);
    strictEqual(effortFillCount(FULL, "high"), 3);
    strictEqual(effortFillCount(FULL, "xhigh"), 4);
    strictEqual(effortFillCount(TWO, "xhigh"), 2);
  });

  it("is 0 when the level is absent, unset, or the set is empty", () => {
    strictEqual(effortFillCount(TWO, "low"), 0); // low isn't in this model's set
    strictEqual(effortFillCount(FULL, undefined), 0);
    strictEqual(effortFillCount(FULL, null), 0);
    strictEqual(effortFillCount([], "low"), 0);
  });
});

describe("effortBars", () => {
  it("emits one bar per level", () => {
    strictEqual(effortBars(FULL, "high").length, 4);
    strictEqual(effortBars(TWO, "high").length, 2);
    deepStrictEqual(effortBars([], "low"), []);
  });

  it("fills bars up to and including the active level", () => {
    deepStrictEqual(
      effortBars(FULL, "high").map((b) => b.filled),
      [true, true, true, false],
    );
    deepStrictEqual(
      effortBars(FULL, "xhigh").map((b) => b.filled),
      [true, true, true, true],
    );
  });

  it("leaves every bar dimmed when nothing is selected", () => {
    deepStrictEqual(
      effortBars(FULL, undefined).map((b) => b.filled),
      [false, false, false, false],
    );
  });

  it("ascends in height from left to right", () => {
    const bars = effortBars(FULL, "xhigh");
    for (let i = 1; i < bars.length; i++) {
      strictEqual(bars[i].height > bars[i - 1].height, true);
    }
  });

  it("centers the bar group within the viewBox", () => {
    const bars = effortBars(FULL, "low");
    const left = bars[0].x;
    const last = bars[bars.length - 1];
    const right = EFFORT_ICON_VIEWBOX - (last.x + last.width);
    strictEqual(Math.abs(left - right) < 1e-9, true);
  });

  it("keeps every bar inside the viewBox", () => {
    for (const levels of [TWO, FULL]) {
      for (const bar of effortBars(levels, "high")) {
        strictEqual(bar.x >= 0, true);
        strictEqual(bar.x + bar.width <= EFFORT_ICON_VIEWBOX, true);
        strictEqual(bar.y >= 0, true);
        strictEqual(bar.y + bar.height <= EFFORT_ICON_VIEWBOX, true);
      }
    }
  });
});
