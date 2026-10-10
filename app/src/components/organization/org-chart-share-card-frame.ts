import { ART, FONT, fitFontSize, fitText } from "./org-chart-share-card-art";
import { CARD, CARD_TEXT } from "./org-chart-share-card-geometry";

/*
 * The share image's header (kicker, name, counts) and its Houston footer.
 */

/** The words on the image, all authored `t()` copy. */
export interface ShareCardText {
  kicker: string;
  title: string;
  counts: string;
  brand: string;
  site: string;
  more: (count: number) => string;
}

export function paintHeader(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
) {
  const max = CARD.width - CARD.pad * 2;
  ctx.textAlign = "left";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(fitText(ctx, text.kicker, max), CARD.pad, CARD_TEXT.kickerY);
  const size = fitFontSize(ctx, text.title, max, 700, 76, 48);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = ART.ink;
  ctx.fillText(fitText(ctx, text.title, max), CARD.pad, CARD_TEXT.titleY);
  ctx.font = `400 30px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(fitText(ctx, text.counts, max), CARD.pad, CARD_TEXT.countsY);
}

export function paintFooter(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
  helmet: CanvasImageSource | null,
) {
  const y = CARD_TEXT.footerY;
  let x = CARD.pad;
  if (helmet) {
    ctx.drawImage(helmet, x, y - 30, 34, 37);
    x += 46;
  }
  ctx.textAlign = "left";
  ctx.font = `700 28px ${FONT}`;
  ctx.fillStyle = ART.ink;
  ctx.fillText(text.brand, x, y);
  ctx.textAlign = "right";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = ART.faint;
  ctx.fillText(text.site, CARD.width - CARD.pad, y);
}
