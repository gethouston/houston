import { useCallback, useRef } from "react";

/**
 * A callback ref that scrolls its element to the horizontal centre once,
 * the first time it has a real size. Admin is kept alive, so the chart can
 * mount (or get its data) while the screen is hidden and every measure
 * reads 0: it waits, through a ResizeObserver, for the first non-zero box
 * rather than centring on nothing. After that it leaves the scroll alone.
 */
export function useCentreOnce<T extends HTMLElement>() {
  const done = useRef(false);
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || done.current) return;
    const centre = () => {
      if (el.clientWidth === 0) return false;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      done.current = true;
      return true;
    };
    if (centre() || typeof ResizeObserver !== "function") return;
    const watcher = new ResizeObserver(() => {
      if (centre()) watcher.disconnect();
    });
    watcher.observe(el);
    observer.current = watcher;
  }, []);
}
