import { useEffect, useState } from "react";

/**
 * How many pixels of the layout viewport's bottom the on-screen keyboard (or
 * other browser UI) currently occludes, per the visualViewport API — 0 when
 * nothing is occluded or the API is unavailable. iOS Safari does NOT shrink
 * `dvh` when the keyboard opens, so a full-height chat screen pads its bottom
 * by this to keep the composer above the keys; the message log's
 * stick-to-bottom re-anchors on the resulting resize.
 *
 * Measured against `pageTop` (document scroll + visual offset), not
 * `offsetTop`: a browser that reveals the focused composer by scrolling the
 * document itself would otherwise leave that scroll as a gap between the
 * composer and the keys.
 */
export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const occluded = window.innerHeight - viewport.height - viewport.pageTop;
      setInset(Math.max(0, Math.round(occluded)));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
