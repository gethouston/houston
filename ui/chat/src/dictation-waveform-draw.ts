import { drawEnvelope, withAlpha } from "./dictation-waveform-envelope";
import type { WaveformLayout } from "./dictation-waveform-math";

const MAX_HALF_FRACTION = 0.44;
const BODY_ALPHA = 0.82;
const LEADER_ALPHA = 0.28;
const FROZEN_ALPHA = 0.5;
const SHIMMER_HALF_PX = 26;

export type WaveformMode = "recording" | "requesting" | "transcribing";

export interface DrawOpts {
  mode: WaveformMode;
  shimmer: number;
}

function drawLeader(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  midY: number,
  color: string,
): void {
  if (toX <= fromX) return;
  ctx.strokeStyle = withAlpha(color, LEADER_ALPHA);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, midY);
  ctx.lineTo(toX, midY);
  ctx.stroke();
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  color: string,
  layout: WaveformLayout,
  opts: DrawOpts,
): void {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.globalAlpha = 1;
  const midY = cssH / 2;
  const maxHalf = cssH * MAX_HALF_FRACTION;

  if (opts.mode === "requesting") {
    drawLeader(ctx, 0, cssW, midY, color);
    return;
  }

  if (opts.mode === "transcribing") {
    drawEnvelope(
      ctx,
      layout,
      cssW,
      midY,
      maxHalf,
      color,
      BODY_ALPHA * FROZEN_ALPHA,
    );
    const bandX = opts.shimmer * cssW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bandX - SHIMMER_HALF_PX, 0, SHIMMER_HALF_PX * 2, cssH);
    ctx.clip();
    drawEnvelope(ctx, layout, cssW, midY, maxHalf, color, BODY_ALPHA);
    ctx.restore();
    return;
  }

  drawEnvelope(ctx, layout, cssW, midY, maxHalf, color, BODY_ALPHA);
  drawLeader(ctx, layout.leaderFromX, cssW, midY, color);
}
