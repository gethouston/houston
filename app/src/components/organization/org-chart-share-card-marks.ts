import { color, employeeMetal } from "@houston/design-tokens";
import { initialsFor } from "@houston-ai/board";
import {
  avatarHelmetSize,
  employeeMetalColors,
  HELMET_PATHS,
  HELMET_VIEWBOX,
  hexColorMix,
} from "@houston-ai/core";
import { ART } from "./org-chart-share-card-art";
import { FONT, fitText } from "./org-chart-share-card-text";

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
  ctx.lineWidth = 1 / ctx.getTransform().a;
  ctx.strokeStyle = ART.hairline;
  ctx.stroke();
}

const METAL = {
  light: color.light["employee-metal-light"],
  shade: color.light["employee-metal-shade"],
} as const;

let helmetPaths: Path2D[] | undefined;

export function helmetAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: number,
  paint: string,
): void {
  const metal = employeeMetalColors(
    paint,
    METAL.light,
    METAL.shade,
    hexColorMix,
  );
  const r = d / 2;
  const disc = new Path2D();
  disc.arc(x, y, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip(disc);
  const surface = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  surface.addColorStop(0, metal.top);
  surface.addColorStop(1, metal.bottom);
  ctx.fillStyle = surface;
  ctx.fill(disc);
  const edge = new Path2D();
  edge.arc(x, y, r, 0, Math.PI * 2);
  edge.arc(x, y + 1, r, 0, Math.PI * 2);
  ctx.globalAlpha = employeeMetal.highlight;
  ctx.fillStyle = METAL.light;
  ctx.fill(edge, "evenodd");
  ctx.globalAlpha = 1;
  const size = avatarHelmetSize(d);
  const scale = size / HELMET_VIEWBOX.height;
  ctx.translate(x - (HELMET_VIEWBOX.width * scale) / 2, y - size / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = metal.relief;
  helmetPaths ??= HELMET_PATHS.map((path) => new Path2D(path));
  for (const path of helmetPaths) ctx.fill(path);
  ctx.restore();
}
