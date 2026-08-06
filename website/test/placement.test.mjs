// Placement math for the download gate's country / country-code dropdowns.
// The asset is a browser IIFE that hangs its API off `window`, so it is read
// and evaluated with a stub window rather than imported.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "..", "src", "assets", "download-gate-placement.js"),
  "utf8",
);
const stub = {};
new Function("window", source)(stub);
const { fit, place, MIN_HEIGHT } = stub.HoustonDropdownPlacement;

const GUTTER = 8;
const OFFSET = 6;
const MENU = 353; // what the 200-row menu measures at its CSS ceiling

/** A toggle rect as getBoundingClientRect() would report it. */
function anchor(top, { height = 44, left = 30, width = 330 } = {}) {
  return { top, bottom: top + height, left, width };
}

/** A visual viewport; `top` is its offset inside the layout viewport. */
function view(width, height, { top = 0, left = 0 } = {}) {
  return { top, left, width, height };
}

test("opens below the toggle when there is room", () => {
  const spot = place(anchor(200), view(1280, 800), 0, MENU);
  assert.equal(spot.placeAbove, false);
  assert.equal(spot.top, 200 + 44 + OFFSET);
  assert.equal(spot.left, 30);
});

test("flips above when the space below cannot hold a usable menu", () => {
  const spot = place(anchor(600), view(1280, 700), 0, MENU);
  assert.equal(spot.placeAbove, true);
  assert.equal(spot.top + Math.min(MENU, spot.maxHeight) <= 600 - OFFSET, true);
});

test("never places the menu outside the visual viewport", () => {
  for (const [w, h] of [
    [1280, 800],
    [390, 844],
    [390, 400],
    [320, 480],
    [740, 360],
  ]) {
    for (const top of [0, 100, 250, h - 60]) {
      const spot = place(anchor(top), view(w, h), 0, MENU);
      const height = Math.min(MENU, spot.maxHeight);
      assert.ok(spot.top >= GUTTER, `top ${spot.top} at ${w}x${h}/${top}`);
      assert.ok(
        spot.top + height <= h - GUTTER,
        `bottom ${spot.top + height} > ${h - GUTTER} at ${w}x${h}/${top}`,
      );
      assert.ok(spot.left >= GUTTER, `left ${spot.left} at ${w}x${h}/${top}`);
      assert.ok(
        spot.left + spot.width <= w - GUTTER,
        `right overflow at ${w}x${h}/${top}`,
      );
    }
  }
});

// The regression PRODUCT-1240 was reported for: the software keyboard covers
// the bottom half of the screen, so the layout viewport still says 844px tall
// while only the top ~340px is visible. Measuring against the layout viewport
// put the menu under the keyboard and the country was unreachable.
test("keeps the menu above a software keyboard", () => {
  const keyboardView = view(390, 336);
  const spot = place(anchor(240), keyboardView, 0, MENU);
  const height = Math.min(MENU, spot.maxHeight);
  assert.ok(
    spot.top + height <= 336 - GUTTER,
    `menu bottom ${spot.top + height} falls under the keyboard`,
  );
  assert.ok(spot.maxHeight >= MIN_HEIGHT, "menu squashed below a usable size");
});

test("respects a visual viewport offset from pinch-zoom scrolling", () => {
  const spot = place(
    anchor(300),
    view(390, 300, { top: 120, left: 40 }),
    0,
    MENU,
  );
  const height = Math.min(MENU, spot.maxHeight);
  assert.ok(spot.top >= 120 + GUTTER, `top ${spot.top} above the visual box`);
  assert.ok(spot.top + height <= 120 + 300 - GUTTER, "bottom past visual box");
  assert.ok(spot.left >= 40 + GUTTER, `left ${spot.left} left of visual box`);
});

test("honours an explicit menu width but keeps it on screen", () => {
  assert.equal(fit(anchor(100), view(1280, 800), 290).width, 290);
  const narrow = fit(anchor(100), view(320, 640), 290);
  assert.ok(
    narrow.width <= 320 - GUTTER * 2,
    `width ${narrow.width} overflows`,
  );
});

test("falls back to the toggle width, floored at 260", () => {
  assert.equal(fit(anchor(100, { width: 330 }), view(1280, 800), 0).width, 330);
  assert.equal(fit(anchor(100, { width: 120 }), view(1280, 800), 0).width, 260);
});
