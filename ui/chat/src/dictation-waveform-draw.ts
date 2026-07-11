/**
 * Canvas orchestration for the dictation waveform. Composes the visual layers
 * per frame: the mirrored amplitude envelope (`dictation-waveform-envelope.ts`)
 * and a solid hairline leader over the not-yet-recorded remainder. The leading
 * edge (playhead) is a DOM overlay rocket owned by `dictation-waveform.tsx`, not
 * drawn on canvas. Handles the three states — recording (one solid live
 * envelope + leader), requesting (full-width hairline), transcribing (frozen
 * envelope dimmed under a scanning shimmer). Pure layout lives in
 * `dictation-waveform-math.ts`; color derives from the passed `currentColor`.
 */

import { drawEnvelope, withAlpha } from "./dictation-waveform-envelope";
import type { WaveformLayout } from "./dictation-waveform-math";

const MAX_HALF_FRACTION = 0.44; // tallest half-envelope as a fraction of height
const BODY_ALPHA = 0.82; // the one solid envelope body
const LEADER_ALPHA = 0.28; // solid hairline leader
const FROZEN_ALPHA = 0.5; // transcribing dim
const SHIMMER_HALF_PX = 26; // half-width of the transcribing scan band

export type WaveformMode = "recording" | "requesting" | "transcribing";

export interface DrawOpts {
  mode: WaveformMode;
  /** 0..1 scan position for the transcribing shimmer. */
  shimmer: number;
}

/** Solid 1px hairline at the centerline over the not-yet-recorded remainder. */
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
    // Frozen envelope dimmed, with a brightening band that scans across it.
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

  // recording: one solid envelope + a solid hairline leader ahead of the head.
  drawEnvelope(ctx, layout, cssW, midY, maxHalf, color, BODY_ALPHA);
  drawLeader(ctx, layout.leaderFromX, cssW, midY, color);
}
