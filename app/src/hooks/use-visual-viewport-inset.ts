import { type RefObject, useEffect, useState } from "react";

/**
 * How far the bottom edge of `ref`'s element lies below what the visual
 * viewport shows, in pixels: the part of a full-height screen the on-screen
 * keyboard (or other browser UI) occludes. 0 when nothing is occluded or the
 * API is unavailable.
 *
 * Browsers disagree about keyboards. iOS Safari (and Android Chrome in its
 * default `resizes-visual` mode) keeps the layout viewport, so `dvh` does not
 * shrink and a full-height chat screen must pad its bottom by this to keep
 * the composer above the keys. Android in `resizes-content` mode shrinks the
 * layout viewport itself, so the screen already ends at the keyboard and any
 * extra padding is a blank band above the keys. Measuring the element's own
 * edge against the visible bottom (both in layout-viewport coordinates) gives
 * the right answer in either mode without knowing which one is in effect,
 * and a browser that reveals the focused composer by scrolling is accounted
 * for the same way. The message log's stick-to-bottom re-anchors on the
 * resulting resize.
 */
export function useVisualViewportInset(
  ref: RefObject<HTMLElement | null>,
): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const bottom = element.getBoundingClientRect().bottom;
      const visibleBottom = viewport.offsetTop + viewport.height;
      setInset(Math.max(0, Math.round(bottom - visibleBottom)));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    // The layout viewport can resize after the visual one reports (the
    // keyboard animates in); the last word must come from whichever fires last.
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return inset;
}
