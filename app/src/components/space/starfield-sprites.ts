/**
 * Offscreen-sprite + static-layer building for {@link Starfield}, split out of
 * {@link ./starfield-model} to keep each file within budget. Everything here is
 * built ONCE (per resize) so the draw loop only ever `drawImage`s — no per-frame
 * gradient/pattern allocation. All colour comes from the caller's palette; this
 * module never hardcodes a colour literal.
 */

import { type Rgb, rgba, type SpacePalette } from "./starfield-model";

/** Intrinsic pixel size of the bloom sprite canvas. */
const BLOOM_SPRITE_PX = 64;

/** Average two RGB triples (for the neutral temperature tint). */
const mix = (a: Rgb, b: Rgb): Rgb => [
  Math.round((a[0] + b[0]) / 2),
  Math.round((a[1] + b[1]) / 2),
  Math.round((a[2] + b[2]) / 2),
];

/** One bloom halo: near-white core, `tint`-coloured outer glare. */
function makeBloom(palette: SpacePalette, tint: Rgb): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = BLOOM_SPRITE_PX;
  c.height = BLOOM_SPRITE_PX;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const mid = BLOOM_SPRITE_PX / 2;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0, rgba(palette.star, 0.9)); // white-hot core
  g.addColorStop(0.2, rgba(palette.star, 0.4));
  g.addColorStop(0.45, rgba(tint, 0.18)); // temperature-tinted glare
  g.addColorStop(0.7, rgba(tint, 0.05));
  g.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BLOOM_SPRITE_PX, BLOOM_SPRITE_PX);
  return c;
}

/**
 * The three bloom sprites, indexed by a star's `bloomTemp` bucket
 * (0 cool / 1 neutral / 2 warm). Each shares a near-white core but tints its
 * outer glare by temperature, so a warm star glows warm without a warm core.
 */
export function makeBloomSprites(palette: SpacePalette): HTMLCanvasElement[] {
  return [
    makeBloom(palette, palette.star),
    makeBloom(palette, mix(palette.star, palette.starWarm)),
    makeBloom(palette, palette.starWarm),
  ];
}

/**
 * The static backdrop layer, built once per resize at device resolution and
 * `drawImage`d each frame under the stars: a feathered diagonal haze band and a
 * corner vignette that eases toward the canvas colour. (Banding is now killed by
 * the nebula shader's per-pixel dither, so no grain tile is painted here — that
 * would double the noise.)
 */
export function makeStaticLayer(
  w: number,
  h: number,
  dpr: number,
  palette: SpacePalette,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintHazeBand(ctx, w, h, palette);
  paintVignette(ctx, w, h, palette);
  return c;
}

/** Feathered diagonal Milky-Way haze band, lower-left → upper-right. */
function paintHazeBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: SpacePalette,
): void {
  const diag = Math.hypot(w, h);
  const halfWidth = diag * 0.175;
  const angle = Math.atan2(-h, w);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
  g.addColorStop(0, rgba(palette.haze, 0));
  g.addColorStop(0.35, rgba(palette.haze, 0.03));
  g.addColorStop(0.5, rgba(palette.haze, 0.055));
  g.addColorStop(0.65, rgba(palette.haze, 0.03));
  g.addColorStop(1, rgba(palette.haze, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-diag * 0.7, -halfWidth, diag * 1.4, halfWidth * 2);
  ctx.restore();
}

/** Gentle radial edge darkening toward the canvas colour (~0.3 at corners). */
function paintVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: SpacePalette,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, outer * 0.35, cx, cy, outer);
  g.addColorStop(0, rgba(palette.canvas, 0));
  g.addColorStop(1, rgba(palette.canvas, 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
