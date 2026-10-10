import { type RefObject, useLayoutEffect } from "react";
import {
  ENTRANCE_CURVE,
  REVEAL,
  revealDelay,
  revealKeyframes,
} from "./org-chart-motion";

/**
 * Stagger the `[data-reveal]` nodes under `ref` in once, on mount, with the
 * `[data-reveal-lines]` connectors fading in behind them. Admin is
 * kept alive and the chart re-renders on every data refresh, so this runs
 * on the first layout only: a refresh, or a node added later, never replays
 * it. Under reduced motion the nodes fade without rising. Web Animations, so
 * it runs off the main thread and needs no stylesheet.
 */
export function useRevealOnce(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const keyframes = revealKeyframes(reduced);
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    nodes.forEach((node, index) => {
      if (typeof node.animate !== "function") return;
      node.animate(keyframes, {
        duration: REVEAL.durationMs,
        delay: revealDelay(index),
        easing: ENTRANCE_CURVE,
        fill: "backwards",
      });
    });
    // The lines fade in across the whole stagger, so none is ever drawn to
    // a card that has not arrived yet.
    const lines = root.querySelector<SVGElement>("[data-reveal-lines]");
    if (lines && typeof lines.animate === "function" && nodes.length > 0)
      lines.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: revealDelay(nodes.length - 1) + REVEAL.durationMs,
        easing: ENTRANCE_CURVE,
        fill: "backwards",
      });
  }, [ref]);
}
