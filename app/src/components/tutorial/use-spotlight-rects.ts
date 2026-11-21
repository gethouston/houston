import { useEffect, useState } from "react";
import type { Rect, Viewport } from "./tutorial-spotlight-geometry";

const PAD = 6;
const MEASURE_MS = 300;

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
