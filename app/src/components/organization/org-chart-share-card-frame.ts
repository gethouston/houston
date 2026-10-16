import { ART, track } from "./org-chart-share-card-art";
import type { CardFrame } from "./org-chart-share-card-geometry";
import { FONT, fitFontSize, fitText } from "./org-chart-share-card-text";

/*
 * The share image's header (name, counts) and its quiet footer.
 */

/** The words on the image, all authored `t()` copy. */
export interface ShareCardText {
  title: string;
  counts: string;
  site: string;
  more: (count: number) => string;
}

export function paintHeader(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
  frame: CardFrame,
) {
  const { pad, type } = frame;
  const max = frame.width - pad * 2;
  ctx.textAlign = "left";
  // A confident title: heavy, tight-tracked, shrunk to fit before it is cut.
  track(ctx, type.tracking);
  const size = fitFontSize(
    ctx,
    text.title,
    max,
    700,
    type.title,
    type.titleMin,
  );
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = ART.ink;
  ctx.fillText(fitText(ctx, text.title, max), pad, frame.titleY);
  track(ctx, 0);
  ctx.font = `400 ${type.counts}px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(fitText(ctx, text.counts, max), pad, frame.countsY);
}

/** The mark's viewBox is 412 x 449. */
const MARK_ASPECT = 412 / 449;

/** The Houston mark and the site, small, bottom left. */
export function paintFooter(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
  mark: CanvasImageSource | null,
  frame: CardFrame,
) {
  const { footerY: y, type } = frame;
  let x = frame.pad;
  if (mark) {
    // Sits on the site's baseline, a little above it like a capital.
    ctx.drawImage(
      mark,
      x,
      y - type.mark * (6 / 7),
      type.mark * MARK_ASPECT,
      type.mark,
    );
    x += type.mark * (38 / 28);
  }
  ctx.textAlign = "left";
  ctx.font = `500 ${type.site}px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(text.site, x, y);
}
