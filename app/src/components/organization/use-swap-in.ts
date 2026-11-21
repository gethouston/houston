import { durationMs } from "@houston/design-tokens";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { ENTRANCE_CURVE, swapInKeyframes } from "./org-chart-motion";

export function useSwapIn<T extends HTMLElement>(
  key: string,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const shown = useRef(key);
  useLayoutEffect(() => {
    if (shown.current === key) return;
    shown.current = key;
    const node = ref.current;
    if (!node || typeof node.animate !== "function") return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.animate(swapInKeyframes(reduced), {
      duration: durationMs.fast,
      easing: ENTRANCE_CURVE,
    });
  }, [key]);
  return ref;
}
