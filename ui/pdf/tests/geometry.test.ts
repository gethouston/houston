import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contextBox,
  cropFrame,
  mergeLineBoxes,
  PIN_SIZE,
  placePin,
  toBox,
} from "../src/geometry.ts";
import type { PdfBox } from "../src/types.ts";

const PAGE = { width: 1000, height: 562.5 };

/** The pin's own box in page pixels, from its center in percent. */
const pinBox = (p: { x: number; y: number }) => ({
  left: (p.x / 100) * PAGE.width - PIN_SIZE / 2,
  top: (p.y / 100) * PAGE.height - PIN_SIZE / 2,
  right: (p.x / 100) * PAGE.width + PIN_SIZE / 2,
  bottom: (p.y / 100) * PAGE.height + PIN_SIZE / 2,
});
const hits = (pin: ReturnType<typeof pinBox>, b: PdfBox) =>
  pin.left < ((b.x + b.w) / 100) * PAGE.width &&
  (b.x / 100) * PAGE.width < pin.right &&
  pin.top < ((b.y + b.h) / 100) * PAGE.height &&
  (b.y / 100) * PAGE.height < pin.bottom;

test("a client rect becomes percent of its page, clipped to it", () => {
  assert.deepEqual(
    toBox(
      { left: 150, top: 80, width: 900, height: 20 },
      { left: 100, top: 50, width: 1000, height: 500 },
    ),
    { x: 5, y: 6, w: 90, h: 4 },
  );
});

test("spans on one line merge; the next line stays apart", () => {
  const lines = mergeLineBoxes([
    { x: 30, y: 10, w: 10, h: 4 },
    { x: 10, y: 10.2, w: 15, h: 4 },
    { x: 10, y: 16, w: 20, h: 4 },
  ]);
  assert.deepEqual(lines, [
    { x: 10, y: 10, w: 30, h: 4.2 },
    { x: 10, y: 16, w: 20, h: 4 },
  ]);
});

test("a title pin sits left of the quote when the margin has room", () => {
  const quote: PdfBox = { x: 6, y: 8, w: 50, h: 5 };
  const pin = placePin(
    { kind: "text", quote: "El problema", boxes: [quote] },
    PAGE,
  );
  assert.equal(hits(pinBox(pin), quote), false);
  assert.ok(pinBox(pin).right <= (quote.x / 100) * PAGE.width);
});

test("a mid-line quote's pin avoids the quote and the words around it", () => {
  const before: PdfBox = { x: 4, y: 40, w: 30, h: 4 };
  const quote: PdfBox = { x: 34.5, y: 40, w: 20, h: 4 };
  const after: PdfBox = { x: 55, y: 40, w: 40, h: 4 };
  const below: PdfBox = { x: 4, y: 45, w: 90, h: 4 };
  const pin = placePin(
    { kind: "text", quote: "Bogotá", boxes: [quote] },
    PAGE,
    [before, quote, after, below],
  );
  for (const b of [before, quote, after, below])
    assert.equal(hits(pinBox(pin), b), false);
});

test("an area pin straddles its top-left corner, kept on the page", () => {
  assert.deepEqual(
    placePin({ kind: "area", box: { x: 0, y: 0, w: 20, h: 20 } }, PAGE),
    { x: 1.5, y: (15 / 562.5) * 100 },
  );
});

test("a crop around one line keeps context and stays on the page", () => {
  const box = contextBox({ x: 90, y: 2, w: 8, h: 3 }, 16 / 9);
  assert.ok(box.w >= 30);
  assert.ok(box.x + box.w <= 100 && box.y >= 0);
  assert.ok(box.x <= 90 && box.x + box.w >= 98);
});

test("a crop is drawn 1024 pixels on its long side, however small the page shows", () => {
  const slide = { width: 960, height: 540 };
  const frame = cropFrame({ x: 10, y: 20, w: 12, h: 4 }, slide, 1024);
  assert.equal(Math.max(frame.width, frame.height), 1024);
  assert.ok(frame.x >= 0 && frame.y >= 0);
  assert.ok(frame.x + frame.width <= slide.width * frame.scale + 1);
  assert.ok(frame.y + frame.height <= slide.height * frame.scale + 1);
});

test("a crop from the page on screen is never scaled up", () => {
  const canvas = { width: 460, height: 259 };
  const frame = cropFrame({ x: 70, y: 20, w: 28, h: 30 }, canvas, 1024, 1);
  assert.equal(frame.scale, 1);
  assert.deepEqual(
    { width: frame.width, height: frame.height },
    { width: 156, height: 98 },
  );
});
