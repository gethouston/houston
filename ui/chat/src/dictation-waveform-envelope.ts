/**
 * The mirrored amplitude envelope — the audio-editor curve at the heart of the
 * dictation waveform. Given a `WaveformLayout`, it traces a smooth Catmull-Rom
 * curve through the level points, mirrors it about the centerline, fills the
 * body, and strokes a crisp 1px edge. Pure layout lives in
 * `dictation-waveform-math.ts`; the orchestration (leader, head, modes) lives in
 * `dictation-waveform-draw.ts`. All color derives from the passed `currentColor`
 * string — only alpha varies, so it themes without hardcoded hex.
 */

import {
  catmullRomToBezier,
  envelopeHalfHeight,
  type Point,
  type WaveformLayout,
} from "./dictation-waveform-math";

const MIN_HALF_PX = 0.75; // silence hairline (half-height)
const OLDEST_FADE_FRACTION = 0.1; // gentle alpha falloff on the oldest slice
export const EDGE_ALPHA = 0.9; // crisp 1px outline along the envelope

/** Replace the alpha of a `rgb(...)`/`rgba(...)` color string. */
export function withAlpha(color: string, alpha: number): string {
  const m = color.match(/-?\d+\.?\d*/g);
  if (!m || m.length < 3) return color;
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
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

/** Trace the closed mirrored-envelope path (top curve L→R, bottom curve R→L). */
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

/** Stroke just the top + bottom edge curves (the crisp outline). */
function traceEdges(
  ctx: CanvasRenderingContext2D,
  top: readonly Point[],
  midY: number,
): void {
  const segs = catmullRomToBezier(top);
  const first = top[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const s of segs)
    ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p1.x, s.p1.y);
  ctx.moveTo(first.x, 2 * midY - first.y);
  for (const s of segs)
    ctx.bezierCurveTo(
      s.c1.x,
      2 * midY - s.c1.y,
      s.c2.x,
      2 * midY - s.c2.y,
      s.p1.x,
      2 * midY - s.p1.y,
    );
}

/**
 * Fill + outline the mirrored envelope for `layout` at `bodyAlpha`. A single
 * point degrades to a small dot; while scrolling, the oldest slice fades so
 * buckets don't pop as they slide off the left edge.
 */
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
  traceEdges(ctx, top, midY);
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha(
    color,
    layout.full ? EDGE_ALPHA * 0.85 : EDGE_ALPHA,
  );
  ctx.stroke();
}
