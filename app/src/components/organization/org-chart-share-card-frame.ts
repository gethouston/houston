import { ART, track } from "./org-chart-share-card-art";
import { CARD, CARD_TEXT } from "./org-chart-share-card-geometry";
import { FONT, fitFontSize, fitText } from "./org-chart-share-card-text";

/*
 * The share image's header (kicker, name, counts) and its quiet footer.
 */

/** The words on the image, all authored `t()` copy. */
export interface ShareCardText {
  kicker: string;
  title: string;
  counts: string;
  site: string;
  more: (count: number) => string;
}

export function paintHeader(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
) {
  const max = CARD.width - CARD.pad * 2;
  ctx.textAlign = "left";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = ART.faint;
  ctx.fillText(fitText(ctx, text.kicker, max), CARD.pad, CARD_TEXT.kickerY);
  // A confident title: heavy, tight-tracked, shrunk to fit before it is cut.
  track(ctx, -2.5);
  const size = fitFontSize(ctx, text.title, max, 700, 84, 52);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = ART.ink;
  ctx.fillText(fitText(ctx, text.title, max), CARD.pad, CARD_TEXT.titleY);
  track(ctx, 0);
  ctx.font = `400 30px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(fitText(ctx, text.counts, max), CARD.pad, CARD_TEXT.countsY);
}

/** The Houston mark and the site, small, bottom left. */
export function paintFooter(
  ctx: CanvasRenderingContext2D,
  text: ShareCardText,
  mark: CanvasImageSource | null,
) {
  const y = CARD_TEXT.footerY;
  let x = CARD.pad;
  if (mark) {
    // The mark's viewBox is 412 x 449: 28px tall.
    ctx.drawImage(mark, x, y - 24, 25.7, 28);
    x += 38;
  }
  ctx.textAlign = "left";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = ART.muted;
  ctx.fillText(text.site, x, y);
}
