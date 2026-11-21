import { ART, track } from "./org-chart-share-card-art";
import type { CardFrame } from "./org-chart-share-card-geometry";
import { FONT, fitFontSize, fitText } from "./org-chart-share-card-text";

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

const MARK_ASPECT = 412 / 449;

export function paintFooter(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
  mark: CanvasImageSource | null,
  frame: CardFrame,
) {
  const { footerY: y, type } = frame;
  let x = frame.pad;
  if (mark) {
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
