import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { anchorBounds, type CropFrame, cropFrame } from "./geometry";
import { releaseCanvas } from "./page-render";
import type { PdfAnchor, PdfBox, PdfPageSize } from "./types";

/** The crop's long side: enough for the agent to read body text. */
const MAX_SIDE = 1024;

export interface Ink {
  highlight: string;
  outline: string;
}

/** Colours come from the page element, which pins the light theme: the paper
 *  is light whatever the app's theme is. */
export function inkOf(page: HTMLElement): Ink {
  const style = getComputedStyle(page);
  return {
    highlight: style.getPropertyValue("--ht-highlight").trim(),
    outline: style.getPropertyValue("--ht-ink").trim(),
  };
}

/** Draw the selection on the crop (a highlighter wash over quoted text, an
 *  outline round an area) and encode it as base64 PNG without `data:`. */
function finish(
  out: HTMLCanvasElement,
  anchor: PdfAnchor,
  size: PdfPageSize,
  frame: CropFrame,
  ink: Ink,
): string {
  const ctx = out.getContext("2d");
  if (!ctx) {
    releaseCanvas(out);
    return "";
  }
  const at = (b: PdfBox) =>
    [
      (b.x / 100) * size.width * frame.scale - frame.x,
      (b.y / 100) * size.height * frame.scale - frame.y,
      (b.w / 100) * size.width * frame.scale,
      (b.h / 100) * size.height * frame.scale,
    ] as const;
  if (anchor.kind === "text") {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = ink.highlight;
    for (const box of anchor.boxes) ctx.fillRect(...at(box));
  } else {
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink.outline;
    ctx.strokeRect(...at(anchor.box));
  }
  const png = out.toDataURL("image/png");
  releaseCanvas(out);
  return png.slice("data:image/png;base64,".length);
}

function blank(frame: CropFrame): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = frame.width;
  out.height = frame.height;
  return out;
}

/**
 * A quick crop of the selection, with page around it, copied from the page
 * already drawn on screen. Sized by the screen, so only fit for a thumbnail.
 */
export function previewCrop(
  canvas: HTMLCanvasElement,
  anchor: PdfAnchor,
  page: HTMLElement,
): string {
  const size = { width: canvas.width, height: canvas.height };
  const frame = cropFrame(anchorBounds(anchor), size, MAX_SIDE, 1);
  const out = blank(frame);
  out
    .getContext("2d")
    ?.drawImage(
      canvas,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
  return finish(out, anchor, size, frame, inkOf(page));
}

/**
 * The crop the agent reads: the same region drawn by pdf.js at MAX_SIDE
 * pixels on its long side, however small the page shows on screen.
 */
export async function renderCrop(
  doc: PDFDocumentProxy,
  pageNumber: number,
  anchor: PdfAnchor,
  ink: Ink,
): Promise<string> {
  const pdfPage = await doc.getPage(pageNumber);
  const { width, height } = pdfPage.getViewport({ scale: 1 });
  const size = { width, height };
  const frame = cropFrame(anchorBounds(anchor), size, MAX_SIDE);
  const out = blank(frame);
  try {
    await pdfPage.render({
      canvas: out,
      viewport: pdfPage.getViewport({ scale: frame.scale }),
      transform: [1, 0, 0, 1, -frame.x, -frame.y],
    }).promise;
  } catch (error) {
    releaseCanvas(out);
    throw error;
  }
  return finish(out, anchor, size, frame, ink);
}
