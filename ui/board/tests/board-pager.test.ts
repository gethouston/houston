import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearestPageIndex } from "../src/board-pager.ts";

// The phone board pager's one rule: which page a snap container is resting
// on. Offsets are page left edges in scroll coordinates (first page at 0).

describe("nearestPageIndex", () => {
  const offsets = [0, 400, 800];

  it("answers the page whose offset is nearest the scroll position", () => {
    assert.equal(nearestPageIndex(0, offsets), 0);
    assert.equal(nearestPageIndex(390, offsets), 1);
    assert.equal(nearestPageIndex(810, offsets), 2);
  });

  it("mid-swipe positions round to the closer page", () => {
    assert.equal(nearestPageIndex(150, offsets), 0);
    assert.equal(nearestPageIndex(250, offsets), 1);
  });

  it("overscroll clamps to the outer pages", () => {
    assert.equal(nearestPageIndex(-40, offsets), 0);
    assert.equal(nearestPageIndex(2000, offsets), 2);
  });

  it("an empty page list answers 0, never -1", () => {
    assert.equal(nearestPageIndex(120, []), 0);
  });
});
