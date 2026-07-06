/**
 * Scroll-aware sticky chrome for the AI-hub tabs. A sticky bar sits transparent
 * at rest and only fades in its frosted `bg-popover` fill once rows scroll
 * BEHIND it. Return a `sentinelRef` to place at the bar's natural top (a
 * zero-height marker) and the `stuck` flag: it flips true once the sentinel
 * scrolls up past the enclosing scroll container's top edge. Self-contained — it
 * walks up to find the nearest scrollable ancestor, so every mount (the Models
 * tab, the Providers tab, the provider modal's body) works without threading a
 * scroll ref. Shared by `ModelsBrowser` and `ProviderGrid` so both pinned bars
 * behave identically.
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
      const overflowY = getComputedStyle(scroller).overflowY;
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
