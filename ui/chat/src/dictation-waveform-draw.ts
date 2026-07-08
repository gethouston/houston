/**
 * Canvas orchestration for the dictation waveform. Composes the three visual
 * layers per frame: the mirrored amplitude envelope (`dictation-waveform-
 * envelope.ts`), a hairline dotted leader over the not-yet-recorded remainder,
 * and a soft playhead cap at the head. Handles the three states — recording
 * (one solid live envelope), requesting (all-dots), transcribing (frozen
 * envelope dimmed under a scanning shimmer). Pure layout lives in
 * `dictation-waveform-math.ts`; color derives from the passed `currentColor`.
 */

import {
  drawEnvelope,
  EDGE_ALPHA,
  withAlpha,
} from "./dictation-waveform-envelope";
import { SLOT_PITCH_PX, type WaveformLayout } from "./dictation-waveform-math";

const MAX_HALF_FRACTION = 0.44; // tallest half-envelope as a fraction of height
const BODY_ALPHA = 0.82; // the one solid envelope body
const LEADER_ALPHA = 0.28; // idle dotted leader
const LEADER_DOT_R = 0.9;
const HEAD_DOT_R = 2; // soft playhead cap
const FROZEN_ALPHA = 0.5; // transcribing dim
const SHIMMER_HALF_PX = 26; // half-width of the transcribing scan band

export type WaveformMode = "recording" | "requesting" | "transcribing";

export interface DrawOpts {
  mode: WaveformMode;
  /** 0..1 scan position for the transcribing shimmer. */
  shimmer: number;
}

function drawLeader(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  midY: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha(color, LEADER_ALPHA);
  for (let x = fromX + SLOT_PITCH_PX; x < toX; x += SLOT_PITCH_PX) {
    ctx.beginPath();
    ctx.arc(x, midY, LEADER_DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft playhead cap at the head — the only lively motion, confined to the tip. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  headX: number,
  midY: number,
  color: string,
): void {
  ctx.fillStyle = withAlpha(color, EDGE_ALPHA);
  ctx.beginPath();
  ctx.arc(headX, midY, HEAD_DOT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.beginPath();
  ctx.arc(headX, midY, HEAD_DOT_R * 2.4, 0, Math.PI * 2);
  ctx.fill();
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

  // recording: one solid envelope — a single wave, no inner layers.
  drawEnvelope(ctx, layout, cssW, midY, maxHalf, color, BODY_ALPHA);
  drawLeader(ctx, layout.leaderFromX, cssW, midY, color);
  if (layout.points.length > 0) drawHead(ctx, layout.headX, midY, color);
}
