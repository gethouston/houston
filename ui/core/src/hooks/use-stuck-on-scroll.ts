"use client";

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
