import assert from "node:assert/strict";
import { it } from "node:test";
import { nextFitIndex } from "../src/fit-label.ts";

// Drive the measuring loop the way the hook does: re-measure after every
// step until the pick settles.
function settle(widths: number[], slot: number): number {
  let index = 0;
  for (;;) {
    const next = nextFitIndex(index, widths[index] > slot, widths.length);
    if (next === index) return index;
    index = next;
  }
}

// pt "ago. de 2025", "08/2025", "2025" on macOS at 11px.
const PT = [70.2, 45.4, 28];

it("keeps month and year when the slot holds it", () => {
  assert.equal(settle(PT, 72), 0);
  assert.equal(settle(PT, 70.2), 0);
});

it("steps to the numeric month and year, then the year alone", () => {
  assert.equal(settle(PT, 66), 1);
  assert.equal(settle(PT, 30), 2);
});

it("shows the last form when nothing fits rather than looping", () => {
  assert.equal(settle(PT, 10), 2);
  assert.equal(settle([50], 10), 0);
});
