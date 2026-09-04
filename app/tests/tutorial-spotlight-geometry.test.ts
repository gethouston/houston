import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockerPanels } from "../src/components/tutorial/tutorial-spotlight-geometry.ts";

// The four panels around the spotlight's hole own the pointer events. A
// negative size is invalid CSS the browser silently drops, leaving the
// previous step's panel in place, so every size must clamp at zero.

const viewport = { w: 412, h: 839 };

describe("blockerPanels", () => {
  it("covers the whole viewport while there is no hole", () => {
    assert.deepEqual(blockerPanels(null, viewport), [
      { top: 0, left: 0, width: 412, height: 839 },
    ]);
  });

  it("frames a hole inside the viewport on four sides", () => {
    const panels = blockerPanels(
      { top: 100, left: 50, width: 200, height: 40 },
      viewport,
    );
    assert.deepEqual(panels, [
      { top: 0, left: 0, width: 412, height: 100 },
      { top: 140, left: 0, width: 412, height: 699 },
      { top: 100, left: 0, width: 50, height: 40 },
      { top: 100, left: 250, width: 162, height: 40 },
    ]);
  });

  it("never emits a negative size for a hole that overhangs the viewport", () => {
    // A full-bleed target padded past every edge: the phone's chat screen.
    const panels = blockerPanels(
      { top: -6, left: -6, width: 424, height: 851 },
      viewport,
    );
    for (const p of panels) {
      assert.ok(p.width >= 0, `width ${p.width}`);
      assert.ok(p.height >= 0, `height ${p.height}`);
    }
    // Nothing is walled off: every panel is empty.
    assert.ok(panels.every((p) => p.width === 0 || p.height === 0));
  });
});
