import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveHorizontalWheelScroll } from "../src/ai-elements/horizontal-wheel-scroll.ts";

const strip = { scrollLeft: 100, scrollWidth: 1000, clientWidth: 400 };

describe("resolveHorizontalWheelScroll", () => {
  it("turns a mouse wheel (deltaY only) into horizontal movement", () => {
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: 50,
        shiftKey: false,
      }),
      { scrollLeft: 150 },
    );
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: -50,
        shiftKey: false,
      }),
      { scrollLeft: 50 },
    );
  });

  it("keeps trackpad horizontal swipes on their own axis", () => {
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 30,
        deltaY: 5,
        shiftKey: false,
      }),
      { scrollLeft: 130 },
    );
  });

  it("honours shift+wheel the way browsers do", () => {
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: 20,
        shiftKey: true,
      }),
      { scrollLeft: 120 },
    );
  });

  it("clamps to the scrollable range", () => {
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: 5000,
        shiftKey: false,
      }),
      { scrollLeft: 600 },
    );
    assert.deepEqual(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: -5000,
        shiftKey: false,
      }),
      { scrollLeft: 0 },
    );
  });

  it("lets the page scroll when the strip does not overflow or is at its edge", () => {
    assert.equal(
      resolveHorizontalWheelScroll({
        scrollLeft: 0,
        scrollWidth: 300,
        clientWidth: 400,
        deltaX: 0,
        deltaY: 50,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      resolveHorizontalWheelScroll({
        ...strip,
        scrollLeft: 600,
        deltaX: 0,
        deltaY: 50,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      resolveHorizontalWheelScroll({
        ...strip,
        scrollLeft: 0,
        deltaX: 0,
        deltaY: -50,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      resolveHorizontalWheelScroll({
        ...strip,
        deltaX: 0,
        deltaY: 0,
        shiftKey: false,
      }),
      null,
    );
  });
});
