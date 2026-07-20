"use client";

/**
 * Scroll-aware sticky chrome. A sticky bar sits transparent at rest and only
 * fades in its opaque fill once rows scroll BEHIND it. Place the returned
 * `sentinelRef` on a zero-height marker at the bar's natural top; the `stuck`
 * flag flips true once that sentinel scrolls up past the enclosing scroll
 * container's top edge. Self-contained — it walks up to find the nearest
 * scrollable ancestor, so every mount works without threading a scroll ref.
 * Generic and surface-agnostic: shared by the catalog shell's pinned controls
 * and the provider browser's filter bar so their pinned bars behave identically.
 */

import { useEffect, useRef, useState } from "react";

export function useStuckOnScroll() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    let scroller = sentinel.parentElement;
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scroller = scroller.parentElement;
    }
    const update = () => {
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      setStuck(sentinel.getBoundingClientRect().top < top - 0.5);
    };
    update();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return { sentinelRef, stuck };
}
