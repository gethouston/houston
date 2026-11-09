import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PdfPageSize } from "./types";

/** Pages within this many viewport heights keep a rendered canvas. */
const NEAR_VIEWPORTS = 1;

export interface PageBox {
  top: number;
  width: number;
  height: number;
}

/**
 * Lay the pages out in one column at `zoom` times the viewer's width, and
 * track which page the reader is on and which pages are near enough to
 * render. A zoom or a resize keeps the page under the reader in place.
 */
export function usePageLayout(
  scroller: RefObject<HTMLDivElement | null>,
  sizes: readonly PdfPageSize[],
  zoom: number,
  gap: number,
  pad: number,
) {
  const [viewerWidth, setViewerWidth] = useState(0);
  const [active, setActive] = useState(1);
  const [near, setNear] = useState<ReadonlySet<number>>(new Set([1]));

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewerWidth(el.clientWidth));
    observer.observe(el);
    setViewerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [scroller]);

  const pageWidth = Math.max(120, (viewerWidth - pad * 2) * zoom);
  const boxes: PageBox[] = [];
  let top = pad;
  for (const size of sizes) {
    const height = (pageWidth * size.height) / size.width;
    boxes.push({ top, width: pageWidth, height });
    top += height + gap;
  }
  const contentHeight = top - gap + pad;

  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;
    const reach = el.clientHeight * NEAR_VIEWPORTS;
    let best = 1;
    let bestVisible = -1;
    const nearSet = new Set<number>();
    boxesRef.current.forEach((b, i) => {
      const visible =
        Math.min(viewBottom, b.top + b.height) - Math.max(viewTop, b.top);
      if (visible > bestVisible) {
        bestVisible = visible;
        best = i + 1;
      }
      if (b.top + b.height >= viewTop - reach && b.top <= viewBottom + reach)
        nearSet.add(i + 1);
    });
    setActive(best);
    setNear((prev) =>
      prev.size === nearSet.size && [...nearSet].every((p) => prev.has(p))
        ? prev
        : nearSet,
    );
  }, [scroller]);

  // Hold the reader's place across zoom and resize: the same point of the
  // same page stays at the top of the viewport.
  const anchor = useRef<{ page: number; offset: number } | null>(null);
  const lastWidth = useRef(pageWidth);
  useLayoutEffect(() => {
    const el = scroller.current;
    const held = anchor.current;
    if (el && held && lastWidth.current !== pageWidth) {
      const box = boxes[held.page - 1];
      if (box) el.scrollTop = box.top + held.offset * box.height;
    }
    lastWidth.current = pageWidth;
    measure();
  });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        const i = boxesRef.current.findIndex(
          (b) => b.top + b.height > el.scrollTop,
        );
        const box = boxesRef.current[i];
        anchor.current = box
          ? { page: i + 1, offset: (el.scrollTop - box.top) / box.height }
          : null;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [scroller, measure]);

  const scrollToPage = useCallback(
    (page: number, smooth: boolean, focusY?: number) => {
      const el = scroller.current;
      const box = boxesRef.current[page - 1];
      if (!el || !box) return;
      const y =
        focusY === undefined
          ? box.top - pad
          : box.top + (focusY / 100) * box.height - el.clientHeight / 3;
      el.scrollTo({
        top: Math.max(0, y),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [scroller, pad],
  );

  return { boxes, contentHeight, pageWidth, active, near, scrollToPage };
}
