import type { PdfAnchor, PdfBox } from "./types";

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Hundredths of a percent: finer than any screen, and short in a marker. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const rounded = (b: PdfBox): PdfBox => ({
  x: r2(b.x),
  y: r2(b.y),
  w: r2(b.w),
  h: r2(b.h),
});

/** A client rect as percent of the page rect it sits on, clipped to it. */
export function toBox(rect: RectLike, page: RectLike): PdfBox {
  const x0 = clamp((rect.left - page.left) / page.width, 0, 1);
  const y0 = clamp((rect.top - page.top) / page.height, 0, 1);
  const x1 = clamp((rect.left + rect.width - page.left) / page.width, 0, 1);
  const y1 = clamp((rect.top + rect.height - page.top) / page.height, 0, 1);
  return rounded({
    x: x0 * 100,
    y: y0 * 100,
    w: (x1 - x0) * 100,
    h: (y1 - y0) * 100,
  });
}

/** The smallest box holding every box. */
export function boundsOf(boxes: readonly PdfBox[]): PdfBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return rounded({ x, y, w: r - x, h: bottom - y });
}

export function anchorBounds(anchor: PdfAnchor): PdfBox {
  return anchor.kind === "text" ? boundsOf(anchor.boxes) : anchor.box;
}

/** A text selection's per-span rects, joined into one box per line. */
export function mergeLineBoxes(boxes: readonly PdfBox[]): PdfBox[] {
  const lines: PdfBox[] = [];
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const box of sorted) {
    const last = lines.at(-1);
    const sameLine =
      last &&
      Math.abs(last.y + last.h / 2 - (box.y + box.h / 2)) <
        Math.min(last.h, box.h) / 2;
    if (last && sameLine) {
      const merged = boundsOf([last, box]);
      lines[lines.length - 1] = merged;
    } else lines.push({ ...box });
  }
  return lines;
}

/**
 * The region a crop shows: the selection with page around it, at least 30% of
 * the page wide and close to 16:10, so a one-line quote still reads in place.
 */
export function contextBox(bounds: PdfBox, pageAspect: number): PdfBox {
  const pad = 3;
  let w = Math.max(bounds.w + pad * 2, 30);
  let h = Math.max(bounds.h + pad * 2, (w * pageAspect) / 1.6);
  if (h > 100) h = 100;
  w = Math.min(100, Math.max(w, (h * 1.6) / pageAspect));
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return {
    x: clamp(cx - w / 2, 0, 100 - w),
    y: clamp(cy - h / 2, 0, 100 - h),
    w,
    h,
  };
}

export const PIN_SIZE = 22;
const GAP = 6;
const EDGE = 4;

interface Point {
  x: number;
  y: number;
}

const overlaps = (a: PdfBox, b: PdfBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where a mark's number pin sits, as its center in percent of the page.
 *
 * An area's pin straddles its top-left corner. A text pin never covers the
 * words it quotes: it tries beside the first line, then the page margins on
 * that line, then above and below the selection, preferring a spot that
 * covers no other text either (`obstacles`, the page's text boxes).
 */
export function placePin(
  anchor: PdfAnchor,
  page: { width: number; height: number },
  obstacles: readonly PdfBox[] = [],
): Point {
  const { width: W, height: H } = page;
  const half = PIN_SIZE / 2;
  const toPct = (p: Point): Point => ({
    x: (p.x / W) * 100,
    y: (p.y / H) * 100,
  });
  if (anchor.kind === "area") {
    const b = anchor.box;
    return toPct({
      x: clamp((b.x / 100) * W, half + EDGE, W - half - EDGE),
      y: clamp((b.y / 100) * H, half + EDGE, H - half - EDGE),
    });
  }
  const px = (b: PdfBox) => ({
    x: (b.x / 100) * W,
    y: (b.y / 100) * H,
    w: (b.w / 100) * W,
    h: (b.h / 100) * H,
  });
  const lines = mergeLineBoxes(anchor.boxes).map(px);
  const all = px(boundsOf(anchor.boxes));
  const first = lines[0] ?? all;
  const lineY = first.y + first.h / 2;
  const candidates: Point[] = [
    { x: all.x - GAP - half, y: lineY },
    { x: EDGE + half, y: lineY },
    { x: all.x + all.w + GAP + half, y: lineY },
    { x: W - EDGE - half, y: lineY },
    { x: all.x + half, y: all.y - GAP - half },
    { x: all.x + half, y: all.y + all.h + GAP + half },
  ];
  const boxOf = (p: Point): PdfBox => ({
    x: p.x - half,
    y: p.y - half,
    w: PIN_SIZE,
    h: PIN_SIZE,
  });
  const inside = (p: Point) =>
    p.x - half >= 0 && p.y - half >= 0 && p.x + half <= W && p.y + half <= H;
  const clearOf = (p: Point, boxes: readonly PdfBox[]) =>
    !boxes.some((b) => overlaps(boxOf(p), b));
  const quoted = lines;
  const others = obstacles.map(px);
  const spot =
    candidates.find(
      (p) => inside(p) && clearOf(p, quoted) && clearOf(p, others),
    ) ?? candidates.find((p) => inside(p) && clearOf(p, quoted));
  return toPct(spot ?? { x: all.x + half, y: all.y + half });
}
