import { useEffect, useState } from "react";
import type { Rect, Viewport } from "./tutorial-spotlight-geometry";

/** Padding between the target and the hole's edge. */
const PAD = 6;
/** Re-measure cadence: well under a user's aim time, cheap enough to poll. */
const MEASURE_MS = 300;

/**
 * The first VISIBLE element a selector matches. Some anchors exist twice in
 * the tree — a desktop control CSS-hidden on the phone beside the phone's
 * own — and `querySelector` would hand back the hidden one first, leaving the
 * hole shut over a control the user can see.
 */
function firstVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    if (el.getBoundingClientRect().width > 0) return el;
  }
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
      const next = toRect(firstVisible(selector), PAD);
      setHole((prev) => (sameRect(prev, next) ? prev : next));
      // The Radix dialog content (`data-state` excludes the lesson's own card,
      // which is a bare role="dialog").
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
