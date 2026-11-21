export function fitTextareaHeight(
  scrollHeight: number,
  maxPx: number,
  minPx = 0,
): { height: number; scrolls: boolean } {
  const cap = Math.max(maxPx, minPx);
  return {
    height: Math.min(Math.max(scrollHeight, minPx), cap),
    scrolls: scrollHeight > cap,
  };
}

export function applyTextareaFit(
  el: HTMLTextAreaElement,
  maxPx: number,
  minPx = 0,
): number {
  el.style.height = "0px";
  el.style.overflow = "hidden";
  const scrollHeight = el.scrollHeight;
  const { height, scrolls } = fitTextareaHeight(scrollHeight, maxPx, minPx);
  el.style.height = `${height}px`;
  el.style.overflow = scrolls ? "auto" : "hidden";
  return scrollHeight;
}
