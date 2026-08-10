import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEADER_HEIGHT,
  headerCollapsesTabs,
  headerHoldsTools,
  headerMode,
} from "../src/components/shell/page-header/page-header-layout.ts";

describe("headerMode", () => {
  const thresholds = { oneRowMin: 1000, compactMin: 700 };

  it("renders the safe stacked form before measurement", () => {
    assert.equal(headerMode(null, thresholds), "stacked");
  });

  it("uses exact boundary values", () => {
    assert.equal(headerMode(1000, thresholds), "full");
    assert.equal(headerMode(999, thresholds), "compact");
    assert.equal(headerMode(700, thresholds), "compact");
    assert.equal(headerMode(699, thresholds), "stacked");
  });

  it("skips compact when no compact minimum exists", () => {
    const direct = { oneRowMin: 720 };
    assert.equal(headerMode(720, direct), "full");
    assert.equal(headerMode(719, direct), "stacked");
  });
});

describe("header mode semantics", () => {
  it("keeps tools in both one-row forms", () => {
    assert.deepEqual(
      (["full", "compact", "stacked"] as const).map(headerHoldsTools),
      [true, true, false],
    );
  });

  it("collapses tabs outside the full form", () => {
    assert.deepEqual(
      (["full", "compact", "stacked"] as const).map(headerCollapsesTabs),
      [false, true, true],
    );
  });

  it("declares the strip height once", () => {
    assert.equal(HEADER_HEIGHT, "h-12");
  });
});
