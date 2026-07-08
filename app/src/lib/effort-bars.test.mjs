import assert from "node:assert/strict";
import test from "node:test";
import { effortBars, effortFillCount } from "./effort-bars.ts";
import { EFFORT_ORDER } from "./providers.ts";

test("effortFillCount is the 1-based position of the active level", () => {
  assert.equal(effortFillCount(EFFORT_ORDER, "low"), 1);
  assert.equal(effortFillCount(EFFORT_ORDER, "high"), 3);
  assert.equal(effortFillCount(EFFORT_ORDER, "xhigh"), 4);
  // Unset or not in the set → nothing solid.
  assert.equal(effortFillCount(EFFORT_ORDER, null), 0);
  assert.equal(effortFillCount(EFFORT_ORDER, "max"), 0); // retired tier, not a member
});

test("the composer gauge always has four bars regardless of the model's level count", () => {
  // The composer passes EFFORT_ORDER (not the model's own levels) so the gauge
  // is identical across models. A 2-level model used to render as two lone bars
  // (a short one + a tall one); now it fills a prefix of the full 4-bar gauge.
  for (const active of [undefined, "low", "high", "xhigh"]) {
    assert.equal(effortBars(EFFORT_ORDER, active).length, 4);
  }
});

test("a 2-level model (high/xhigh) fills the shared gauge by absolute position", () => {
  // deepseek-v4-flash accepts only [high, xhigh]. Cycling sets active to one of
  // those; the gauge fills to that level's position in EFFORT_ORDER, so it reads
  // as a near-full / full gauge, never "one short + one tall".
  const solid = (active) =>
    effortBars(EFFORT_ORDER, active).filter((b) => b.filled).length;
  assert.equal(solid("high"), 3);
  assert.equal(solid("xhigh"), 4);
});

test("bars ascend in height and share one baseline", () => {
  const bars = effortBars(EFFORT_ORDER, "medium");
  for (let i = 1; i < bars.length; i++) {
    assert.ok(bars[i].height > bars[i - 1].height, "heights strictly ascend");
    // Bottom edge (y + height) is the shared baseline.
    assert.equal(
      bars[i].y + bars[i].height,
      bars[i - 1].y + bars[i - 1].height,
    );
  }
});
