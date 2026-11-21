import {
  formatColor,
  parseColor,
} from "@houston-ai/core/src/color-contrast.ts";
import {
  catmullRomToBezier,
  envelopeHalfHeight,
  type Point,
  type WaveformLayout,
} from "./dictation-waveform-math.ts";

const MIN_HALF_PX = 0.75;
const OLDEST_FADE_FRACTION = 0.1;
export const EDGE_ALPHA = 0.9;

export function withAlpha(color: string, alpha: number): string {
  try {
    return formatColor({ ...parseColor(color), a: alpha });
  } catch {
    return alpha <= 0 ? "transparent" : color;
  }
}

function topPoints(
  layout: WaveformLayout,
  midY: number,
  maxHalf: number,
): Point[] {
  return layout.points.map((p) => ({
    x: p.x,
    y: midY - envelopeHalfHeight(p.level, maxHalf, MIN_HALF_PX),
  }));
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  top: readonly Point[],
  midY: number,
): void {
  const segs = catmullRomToBezier(top);
  const first = top[0];
  const last = top[top.length - 1];
  if (!first || !last) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const s of segs)
    ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y);
  ctx.lineTo(last.x, 2 * midY - last.y);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (!s) continue;
    ctx.bezierCurveTo(
      s.c2.x,
      2 * midY - s.c2.y,
      s.c1.x,
      2 * midY - s.c1.y,
      s.p0.x,
      2 * midY - s.p0.y,
    );
  }
  ctx.closePath();
}

export function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  layout: WaveformLayout,
  cssW: number,
  midY: number,
  maxHalf: number,
  color: string,
  bodyAlpha: number,
): void {
  const top = topPoints(layout, midY, maxHalf);
  const first = top[0];
  if (!first) return;
  if (top.length === 1) {
    ctx.fillStyle = withAlpha(color, EDGE_ALPHA);
    ctx.beginPath();
    ctx.arc(first.x, midY, Math.max(MIN_HALF_PX, 1.4), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  tracePath(ctx, top, midY);
  if (layout.full) {
    const grad = ctx.createLinearGradient(0, 0, cssW, 0);
    grad.addColorStop(0, withAlpha(color, 0));
    grad.addColorStop(OLDEST_FADE_FRACTION, withAlpha(color, bodyAlpha));
    grad.addColorStop(1, withAlpha(color, bodyAlpha));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = withAlpha(color, bodyAlpha);
  }
  ctx.fill();
}
