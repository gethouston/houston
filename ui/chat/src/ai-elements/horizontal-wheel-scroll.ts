import { useEffect, useRef } from "react";

export interface WheelScrollInput {
  deltaX: number;
  deltaY: number;
  /** Modifier browsers already use to request horizontal scrolling. */
  shiftKey: boolean;
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/**
 * Maps a wheel gesture onto a horizontal-only strip. Mouse wheels only emit
 * deltaY, so a strip that relies on native deltaX is trackpad-only; this turns
 * the dominant axis into scrollLeft movement. Returns null when the strip
 * should not consume the event: no overflow, or already at the edge the user is
 * pushing towards (so the page behind keeps scrolling).
 */
export function resolveHorizontalWheelScroll(
  input: WheelScrollInput,
): { scrollLeft: number } | null {
  const maxScrollLeft = input.scrollWidth - input.clientWidth;
  if (maxScrollLeft <= 0) return null;
  const delta =
    input.shiftKey || Math.abs(input.deltaX) > Math.abs(input.deltaY)
      ? input.deltaX || input.deltaY
      : input.deltaY;
  if (delta === 0) return null;
  const next = Math.min(maxScrollLeft, Math.max(0, input.scrollLeft + delta));
  if (next === input.scrollLeft) return null;
  return { scrollLeft: next };
}

/**
 * Attaches a non-passive wheel listener to the element that scrolls the Radix
 * viewport. React registers onWheel as passive, so preventDefault (needed to
 * keep the chat log from scrolling instead) only works on a native listener.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>(
  viewportSelector: string,
) {
  const rootRef = useRef<T | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      const viewport = root.querySelector<HTMLElement>(viewportSelector);
      if (!viewport) return;
      const result = resolveHorizontalWheelScroll({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        scrollLeft: viewport.scrollLeft,
        scrollWidth: viewport.scrollWidth,
        clientWidth: viewport.clientWidth,
      });
      if (!result) return;
      event.preventDefault();
      viewport.scrollLeft = result.scrollLeft;
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [viewportSelector]);
  return rootRef;
}
