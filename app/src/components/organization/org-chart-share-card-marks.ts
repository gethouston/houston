import { initialsFor } from "@houston-ai/board";
import { ART } from "./org-chart-share-card-art";
import { FONT, fitText } from "./org-chart-share-card-text";

/*
 * The small marks the share card's nodes wear: centred text, a person's
 * face, an AI Employee's colour accent.
 */

export function centred(
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

/** A round face: the photo, or neutral initials on a soft disc. */
export function face(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: number,
  label: string,
  photo: CanvasImageSource | undefined,
): void {
  const r = d / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) ctx.drawImage(photo, x - r, y - r, d, d);
  else {
    ctx.fillStyle = ART.initialsFill;
    ctx.fillRect(x - r, y - r, d, d);
    ctx.font = `600 ${Math.round(d * 0.36)}px ${FONT}`;
    ctx.fillStyle = ART.initialsInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(label), x, y + 1);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ART.hairline;
  ctx.stroke();
}

/** An AI Employee's colour: a dot in a soft halo of itself. */
export function accent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  halo: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.arc(x, y, halo, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
