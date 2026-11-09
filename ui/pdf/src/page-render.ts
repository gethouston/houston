import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfJs } from "./pdfjs";

/** WebKit refuses canvases past ~16.7M pixels; stay well under it. */
const MAX_CANVAS_PIXELS = 12_000_000;

/** Drop a canvas's pixels now. WebKit counts every live canvas against one
 *  memory budget until it is collected, so a removed one is emptied first. */
export function releaseCanvas(el: Element): void {
  if (el.tagName !== "CANVAS") return;
  const canvas = el as HTMLCanvasElement;
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Draw one page into a fresh canvas at `cssWidth` CSS pixels wide, at the
 * screen's pixel ratio. Resolves `null` when `signal` aborts first.
 */
export async function renderPageCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  signal: AbortSignal,
): Promise<HTMLCanvasElement | null> {
  const page = await doc.getPage(pageNumber);
  if (signal.aborted) return null;
  const base = page.getViewport({ scale: 1 });
  const cssScale = cssWidth / base.width;
  let ratio = globalThis.devicePixelRatio || 1;
  const pixels = base.width * base.height * (cssScale * ratio) ** 2;
  if (pixels > MAX_CANVAS_PIXELS)
    ratio *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
  const viewport = page.getViewport({ scale: cssScale * ratio });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvas, viewport });
  const abort = () => task.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await task.promise;
  } catch (error) {
    releaseCanvas(canvas);
    if (signal.aborted) return null;
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
  if (!signal.aborted) return canvas;
  releaseCanvas(canvas);
  return null;
}

/**
 * Lay the page's text out as transparent spans over the canvas, so a drag
 * makes a real selection. Built at scale 1; the container's
 * `--total-scale-factor` (set by the page) sizes it, so zooming never
 * rebuilds it.
 */
export async function renderTextLayer(
  doc: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLDivElement,
  signal: AbortSignal,
): Promise<void> {
  const [pdfjs, page] = await Promise.all([
    loadPdfJs(),
    doc.getPage(pageNumber),
  ]);
  if (signal.aborted) return;
  container.replaceChildren();
  const layer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport: page.getViewport({ scale: 1 }),
  });
  const abort = () => layer.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await layer.render();
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
