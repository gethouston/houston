// Auto-height for a growing textarea, shared by the composer and the question
// card's answer field. WKWebView (macOS) has no `field-sizing: content`, so the
// height is measured from scrollHeight and set inline.

/** The height a textarea takes for content `scrollHeight` px tall: at least
 *  `minPx`, at most `maxPx`. `scrolls` is true when the content is taller than
 *  the cap, so the field shows its own scrollbar instead of growing. */
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

/** Measures `el` against its content and sets its height inline. The 0px
 *  reset is what makes scrollHeight report the content (not the old box) when
 *  text was deleted; overflow stays hidden during the measure so no scrollbar
 *  flashes. */
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
