import { useCallback, useRef, useState } from "react";
import {
  NO_EDGES,
  type ScrollEdges,
  scrollEdges,
} from "./org-chart-scroll-edges";

export function useScrollEdges<T extends HTMLElement>() {
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);
  const cleanup = useRef<(() => void) | null>(null);
  const ref = useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () =>
      setEdges((prev) => {
        const next = scrollEdges(el);
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const watcher =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    watcher?.observe(el);
    if (el.firstElementChild) watcher?.observe(el.firstElementChild);
    cleanup.current = () => {
      el.removeEventListener("scroll", update);
      watcher?.disconnect();
    };
  }, []);
  return { ref, edges };
}
