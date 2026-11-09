import { anchorBounds, contextBox } from "./geometry";
import type { PdfAnchor, PdfBox } from "./types";

/** The crop's long side: enough for the agent to read body text. */
const MAX_SIDE = 1024;

/**
 * A PNG of the selection with page around it and the selection drawn on (a
 * highlighter wash over quoted text, an outline round an area), so the agent
 * sees exactly what the person pointed at, in context. Base64 without the
 * `data:` prefix. Colours come from `page`, which pins the light theme: the
 * paper is light whatever the app's theme is.
 */
export function cropSelection(
  canvas: HTMLCanvasElement,
  anchor: PdfAnchor,
  page: HTMLElement,
): string {
  const token = (name: string) =>
    getComputedStyle(page).getPropertyValue(name).trim();
  const { width: W, height: H } = canvas;
  const region = contextBox(anchorBounds(anchor), W / H);
  const sx = (region.x / 100) * W;
  const sy = (region.y / 100) * H;
  const sw = (region.w / 100) * W;
  const sh = (region.h / 100) * H;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const at = (b: PdfBox) =>
    [
      ((b.x / 100) * W - sx) * scale,
      ((b.y / 100) * H - sy) * scale,
      (b.w / 100) * W * scale,
      (b.h / 100) * H * scale,
    ] as const;
  if (anchor.kind === "text") {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = token("--ht-highlight");
    for (const box of anchor.boxes) ctx.fillRect(...at(box));
  } else {
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.strokeStyle = token("--ht-ink");
    ctx.strokeRect(...at(anchor.box));
  }
  return out.toDataURL("image/png").slice("data:image/png;base64,".length);
}
