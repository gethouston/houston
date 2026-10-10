import { initialsFor } from "@houston-ai/board";
import {
  ART,
  agentFill,
  circle,
  companyFill,
  FONT,
  fitText,
  paintBackdrop,
  personFill,
  ring,
  shadedDisc,
} from "./org-chart-share-card-art";
import {
  paintFooter,
  paintHeader,
  type ShareCardText,
} from "./org-chart-share-card-frame";
import {
  CARD,
  type CardDisc,
  type CardLayout,
  LABEL,
} from "./org-chart-share-card-geometry";

export type { ShareCardText };

/** Images already loaded and checked safe to draw. */
export interface ShareCardAssets {
  /** Person photos by userId; a person missing here wears initials. */
  photos: ReadonlyMap<string, CanvasImageSource>;
  /** The white Houston helmet, or `null` when it did not load. */
  helmet: CanvasImageSource | null;
}

function centredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  fill: string,
  max: number,
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.fillText(fitText(ctx, text, max), x, y);
}

function initials(
  ctx: CanvasRenderingContext2D,
  label: string,
  disc: CardDisc,
): void {
  const size = Math.round(disc.r * 0.72);
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.fillStyle = ART.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initialsFor(label), disc.x, disc.y + 1);
  ctx.textBaseline = "alphabetic";
}

function helmetIn(
  ctx: CanvasRenderingContext2D,
  helmet: CanvasImageSource,
  disc: CardDisc,
): void {
  // The glyph's viewBox is 412 x 449: its height fills 62% of the disc.
  const h = disc.r * 2 * 0.62;
  const w = h * (412.248 / 448.898);
  ctx.globalAlpha = 0.94;
  ctx.drawImage(helmet, disc.x - w / 2, disc.y - h / 2, w, h);
  ctx.globalAlpha = 1;
}

function paintDisc(
  ctx: CanvasRenderingContext2D,
  disc: CardDisc,
  text: ShareCardText,
  assets: ShareCardAssets,
): void {
  const { node, x, y, r } = disc;
  switch (node.kind) {
    case "company":
      shadedDisc(ctx, x, y, r, companyFill(ctx, x, y, r));
      initials(ctx, node.name, disc);
      return;
    case "agent":
      shadedDisc(ctx, x, y, r, agentFill(node.agent.color));
      if (assets.helmet) helmetIn(ctx, assets.helmet, disc);
      return;
    case "more":
      circle(ctx, x, y, r);
      ctx.fillStyle = ART.chip;
      ctx.fill();
      ring(ctx, x, y, r);
      centredText(
        ctx,
        text.more(node.count),
        x,
        y + 7,
        20,
        600,
        ART.ink,
        r * 2,
      );
      return;
    case "person": {
      const photo = assets.photos.get(node.person.userId);
      if (!photo) {
        shadedDisc(ctx, x, y, r, personFill(node.person.userId));
        initials(ctx, node.person.name, disc);
        return;
      }
      ctx.save();
      circle(ctx, x, y, r);
      ctx.clip();
      ctx.drawImage(photo, x - r, y - r, r * 2, r * 2);
      ctx.restore();
      ring(ctx, x, y, r);
    }
  }
}

function paintLabels(ctx: CanvasRenderingContext2D, disc: CardDisc): void {
  if (!disc.label) return;
  const top = disc.y + disc.r;
  const m = LABEL[disc.labelSize];
  centredText(
    ctx,
    disc.label,
    disc.x,
    top + m.name,
    m.nameSize,
    600,
    ART.ink,
    disc.labelWidth,
  );
  if (disc.sublabel)
    centredText(
      ctx,
      disc.sublabel,
      disc.x,
      top + m.role,
      m.roleSize,
      400,
      ART.muted,
      disc.labelWidth,
    );
}

/** Paint the whole card onto a CARD-sized context. */
export function paintShareCard(
  ctx: CanvasRenderingContext2D,
  layout: CardLayout,
  text: ShareCardText,
  assets: ShareCardAssets,
): void {
  paintBackdrop(ctx, CARD.width, CARD.height);
  paintHeader(ctx, text);
  ctx.strokeStyle = ART.line;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const line of layout.lines) {
    if (line.y2 <= line.y1 && line.x1 === line.x2) continue;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  for (const disc of layout.discs) {
    paintDisc(ctx, disc, text, assets);
    paintLabels(ctx, disc);
  }
  paintFooter(ctx, text, assets.helmet);
}
