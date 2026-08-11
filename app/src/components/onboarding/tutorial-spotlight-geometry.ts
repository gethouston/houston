import { useEffect, useState } from "react";

/**
 * The spotlight's measuring and placement math, apart from its rendering
 * ({@link import("./tutorial-spotlight")}).
 *
 * Everything here is viewport arithmetic: where the target IS, where the coach
 * card fits beside it, and which rectangles have to swallow pointer events so
 * only the hole stays clickable.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
}

export interface Viewport {
  w: number;
  h: number;
}

/** Padding between the target and the hole's edge. */
const PAD = 6;
/** The coach card's fixed width; the renderer sizes the card by it too. */
export const CARD_W = 300;
/** Estimated chip height for placement math (covers the aside variant). */
const CARD_H = 112;
const GAP = 16;
const MARGIN = 16;
/** Re-measure cadence: well under a user's aim time, cheap enough to poll. */
const MEASURE_MS = 300;

const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));

/** Beside the rect when a side fits (right → left → below → above), else null. */
function placeBeside(rect: Rect, vw: number, vh: number): Placement | null {
  const clampTop = (y: number) => clamp(MARGIN, y, vh - CARD_H - MARGIN);
  const clampLeft = (x: number) => clamp(MARGIN, x, vw - CARD_W - MARGIN);
  const right = rect.left + rect.width + GAP;
  if (right + CARD_W + MARGIN <= vw)
    return { top: clampTop(rect.top), left: right };
  if (rect.left - GAP - CARD_W >= MARGIN)
    return { top: clampTop(rect.top), left: rect.left - GAP - CARD_W };
  const centeredLeft = clampLeft(rect.left + rect.width / 2 - CARD_W / 2);
  const below = rect.top + rect.height + GAP;
  if (below + CARD_H + MARGIN <= vh) return { top: below, left: centeredLeft };
  if (rect.top - GAP - CARD_H >= MARGIN)
    return { top: rect.top - GAP - CARD_H, left: centeredLeft };
  return null;
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

/**
 * Where the coach card goes: beside the whole modal (in-dialog), then beside
 * the target itself — for a large modal that IS the modal's own side
 * whitespace — and only then centered. Never parked on the content the user
 * must read or use.
 */
export function placeCard(args: {
  hole: Rect | null;
  dialogRect: Rect | null;
  viewport: Viewport;
  inDialog: boolean;
}): Placement {
  const { hole, dialogRect, viewport, inDialog } = args;
  return (
    (inDialog && dialogRect
      ? placeBeside(dialogRect, viewport.w, viewport.h)
      : null) ??
    (hole ? placeBeside(hole, viewport.w, viewport.h) : null) ?? {
      top: viewport.h / 2 - CARD_H / 2,
      left: clamp(MARGIN, viewport.w / 2 - CARD_W / 2, viewport.w - CARD_W),
    }
  );
}

/**
 * The transparent panels that own the pointer events AROUND the hole (a
 * box-shadow is not hit-testable, so the visual veil alone blocks nothing).
 * With no hole yet, one panel covers the whole viewport.
 */
export function blockerPanels(hole: Rect | null, viewport: Viewport): Rect[] {
  if (!hole)
    return [{ top: 0, left: 0, width: viewport.w, height: viewport.h }];
  return [
    { top: 0, left: 0, width: viewport.w, height: hole.top },
    {
      top: hole.top + hole.height,
      left: 0,
      width: viewport.w,
      height: Math.max(0, viewport.h - hole.top - hole.height),
    },
    { top: hole.top, left: 0, width: hole.left, height: hole.height },
    {
      top: hole.top,
      left: hole.left + hole.width,
      width: Math.max(0, viewport.w - hole.left - hole.width),
      height: hole.height,
    },
  ];
}

/**
 * Live bounds for a step: the target's hole, the open dialog's own box (only
 * for in-dialog steps) and the viewport.
 *
 * Poll + resize: the target can appear/move at any time (view switches,
 * sidebar collapse, async panes). The equality guard keeps the steady state
 * render-free, so a step that has settled costs nothing.
 */
export function useSpotlightRects(
  selector: string,
  inDialog: boolean | undefined,
): { hole: Rect | null; dialogRect: Rect | null; viewport: Viewport } {
  const [hole, setHole] = useState<Rect | null>(null);
  const [dialogRect, setDialogRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    const toRect = (el: Element | null, pad: number): Rect | null => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0
        ? {
            top: r.top - pad,
            left: r.left - pad,
            width: r.width + pad * 2,
            height: r.height + pad * 2,
          }
        : null;
    };
    const measure = () => {
      const next = toRect(document.querySelector(selector), PAD);
      setHole((prev) => (sameRect(prev, next) ? prev : next));
      // The Radix dialog content (`data-state` excludes the coach chip, which
      // is a bare role="dialog").
      const nextDialog = inDialog
        ? toRect(
            document.querySelector('[role="dialog"][data-state="open"]'),
            0,
          )
        : null;
      setDialogRect((prev) => (sameRect(prev, nextDialog) ? prev : nextDialog));
      setViewport((prev) =>
        prev.w === window.innerWidth && prev.h === window.innerHeight
          ? prev
          : { w: window.innerWidth, h: window.innerHeight },
      );
    };
    measure();
    const id = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [selector, inDialog]);

  return { hole, dialogRect, viewport };
}
