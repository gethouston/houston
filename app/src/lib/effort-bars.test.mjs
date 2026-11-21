import assert from "node:assert/strict";
import test from "node:test";
import { effortBars, effortFillCount } from "./effort-bars.ts";
import { EFFORT_ORDER } from "./providers.ts";

test("effortFillCount is the 1-based position of the active level", () => {
  assert.equal(effortFillCount(EFFORT_ORDER, "low"), 1);
  assert.equal(effortFillCount(EFFORT_ORDER, "high"), 3);
  assert.equal(effortFillCount(EFFORT_ORDER, "xhigh"), 4);
  assert.equal(effortFillCount(EFFORT_ORDER, null), 0);
  assert.equal(effortFillCount(EFFORT_ORDER, "max"), 0);
});

test("the composer gauge always has four bars regardless of the model's level count", () => {
  for (const active of [undefined, "low", "high", "xhigh"]) {
    assert.equal(effortBars(EFFORT_ORDER, active).length, 4);
  }
});

test("a 2-level model (high/xhigh) fills the shared gauge by absolute position", () => {
  const solid = (active) =>
    effortBars(EFFORT_ORDER, active).filter((b) => b.filled).length;
  assert.equal(solid("high"), 3);
  assert.equal(solid("xhigh"), 4);
});

test("bars ascend in height and share one baseline", () => {
  const bars = effortBars(EFFORT_ORDER, "medium");
  for (let i = 1; i < bars.length; i++) {
    assert.ok(bars[i].height > bars[i - 1].height, "heights strictly ascend");
    assert.equal(
      bars[i].y + bars[i].height,
      bars[i - 1].y + bars[i - 1].height,
    );
  }
});
