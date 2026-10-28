import { type RefObject, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

/** One measuring step: move to the next shorter candidate while the current
 *  one clips, and stop at the last, which shows whatever its width. */
export function nextFitIndex(
  index: number,
  clipping: boolean,
  count: number,
): number {
  return clipping && index < count - 1 ? index + 1 : index;
}

/**
 * The longest of `candidates` (longest first) that the element shows without
 * clipping. The browser's own truncation is the measure, so any font and any
 * slot width work. A width change of the element's row starts over from the
 * longest, rendered synchronously so a clipped label never paints.
 */
export function useFittingLabel(
  candidates: string[],
  ref: RefObject<HTMLElement | null>,
): string {
  const key = candidates.join("\n");
  const [pick, setPick] = useState({ key, index: 0 });
  const index = pick.key === key ? pick.index : 0;
  const measures = candidates.length > 1;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!measures || !el) return;
    // The text's own width, not scrollWidth: that rounds to whole pixels and
    // misses a label clipped by a fraction ("jan. de 2025" 66.2px in 66px).
    const text = document.createRange();
    text.selectNodeContents(el);
    const clipping =
      text.getBoundingClientRect().width > el.getBoundingClientRect().width;
    const next = nextFitIndex(index, clipping, candidates.length);
    if (next !== pick.index || key !== pick.key) setPick({ key, index: next });
  });

  useLayoutEffect(() => {
    const row = ref.current?.parentElement;
    if (!measures || !row) return;
    let width = row.clientWidth;
    const observer = new ResizeObserver(() => {
      if (row.clientWidth === width) return;
      width = row.clientWidth;
      flushSync(() => setPick({ key, index: 0 }));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [key, measures, ref]);

  return candidates[index] ?? "";
}
