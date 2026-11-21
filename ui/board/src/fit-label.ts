import { type RefObject, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

export function nextFitIndex(
  index: number,
  clipping: boolean,
  count: number,
): number {
  return clipping && index < count - 1 ? index + 1 : index;
}

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
    let width = row.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = row.getBoundingClientRect().width;
      if (next === width) return;
      width = next;
      flushSync(() => setPick({ key, index: 0 }));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [key, measures, ref]);

  return candidates[index] ?? "";
}
