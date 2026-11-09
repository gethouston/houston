import { mergeLineBoxes, toBox } from "./geometry";
import type { PdfAnchor } from "./types";

export const PAGE_ATTR = "data-pdf-page";

/** The page frame an event or node sits in, with its 1-based number. */
export function pageOf(
  node: Node | null,
): { el: HTMLElement; page: number } | null {
  const element =
    node instanceof Element ? node : (node?.parentElement ?? null);
  const el = element?.closest<HTMLElement>(`[${PAGE_ATTR}]`) ?? null;
  if (!el) return null;
  return { el, page: Number(el.getAttribute(PAGE_ATTR)) };
}

/** Whether a pointer landed on a word of the text layer (a drag there
 *  selects text) rather than on the page around it (a drag draws an area). */
export function isOnText(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.tagName === "SPAN" &&
    !!target.closest(".textLayer") &&
    !target.classList.contains("markedContent")
  );
}

/**
 * The live text selection inside `container`, as an anchor on the page it
 * starts on, or null when nothing (or only whitespace) is selected there.
 */
export function readTextSelection(
  container: HTMLElement,
): { page: number; el: HTMLElement; anchor: PdfAnchor } | null {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null;
  const range = selection.getRangeAt(0);
  const start = pageOf(range.startContainer);
  if (!start || !container.contains(start.el)) return null;
  const frame = start.el.getBoundingClientRect();
  const boxes = [...range.getClientRects()]
    .filter(
      (r) =>
        r.width > 1 &&
        r.height > 1 &&
        r.top >= frame.top - 1 &&
        r.bottom <= frame.bottom + 1,
    )
    .map((r) => toBox(r, frame))
    .filter((b) => b.w > 0 && b.h > 0);
  const quote = selection.toString().replace(/\s+/g, " ").trim();
  if (boxes.length === 0 || !quote) return null;
  return {
    page: start.page,
    el: start.el,
    anchor: { kind: "text", quote, boxes: mergeLineBoxes(boxes) },
  };
}

export function clearTextSelection(): void {
  globalThis.getSelection?.()?.removeAllRanges();
}
