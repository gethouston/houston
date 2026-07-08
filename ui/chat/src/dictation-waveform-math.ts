/**
 * Pure geometry for the dictation waveform track. No DOM — so the layout math
 * runs under the bare Node test runner (`tests/dictation-waveform-math.test.ts`).
 *
 * Model (audio-editor style): every 100ms amplitude bucket owns a FIXED-width
 * slot. While the track has room, buckets render left→right at stable slots and
 * previously drawn buckets NEVER move or change width — the only motion is the
 * head gliding forward. Once the track fills, the whole strip scrolls left
 * (`shift` px) and the oldest slides off. Head and shift derive from ONE clock:
 * continuous elapsed time (`continuousProgress`). The bucket COUNT never feeds
 * them — audio buckets arrive in bursts, and mixing the two clocks made the
 * head jiggle a slot back and forth at every bucket boundary. There is no
 * global re-compression — a bucket's content-x is `index * pitch`, always.
 */

/** One bucket owns this many px of track (mark + gap). DPR-1 css pixels. */
export const SLOT_PITCH_PX = 5;

/** Amplitude history cadence: one bucket per this many ms (matches the app). */
export const WAVEFORM_BUCKET_MS = 100;

const MARGIN_PX = SLOT_PITCH_PX / 2;

export interface WaveformPoint {
  /** Screen x (css px) of this bucket's slot center. */
  x: number;
  /** Amplitude 0..1 for this bucket. */
  level: number;
}

export interface WaveformLayout {
  /** How far (px) the strip is scrolled left; 0 until the track is full. */
  shift: number;
  /** True once the track is full and scrolling. */
  full: boolean;
  /** Screen x of the leading edge (playhead). Pinned to the right edge while full. */
  headX: number;
  /** Screen x where the idle leader begins (equals `headX`). */
  leaderFromX: number;
  /** Visible buckets, oldest→newest, each at its stable slot minus `shift`. */
  points: WaveformPoint[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How many fixed slots fit in a track of `widthPx` css pixels (>= 1). */
export function visibleSlotCount(widthPx: number): number {
  return Math.max(1, Math.floor(widthPx / SLOT_PITCH_PX));
}

/**
 * Continuous bucket position derived from elapsed time alone: 1.0 per bucket
 * window. Monotonic (elapsed only ever grows), so everything positioned from it
 * (head, scroll shift) glides forward and can never step backward — regardless
 * of when the recorder's audio buckets actually land.
 */
export function continuousProgress(
  elapsedMs: number,
  bucketMs: number = WAVEFORM_BUCKET_MS,
): number {
  if (!(elapsedMs > 0) || bucketMs <= 0) return 0;
  return elapsedMs / bucketMs;
}

/**
 * Px the strip is scrolled left. 0 while the head still fits (history
 * pixel-stable); positive once the head would pass the right edge. Driven by
 * the continuous time progress only, so it advances smoothly and monotonically.
 */
export function trackShiftPx(progress: number, widthPx: number): number {
  const raw = progress * SLOT_PITCH_PX + MARGIN_PX * 2 - widthPx;
  return raw > 0 ? raw : 0;
}

/** Screen x of bucket `index`'s slot center for a given scroll `shiftPx`. */
export function bucketScreenX(index: number, shiftPx: number): number {
  return index * SLOT_PITCH_PX + MARGIN_PX - shiftPx;
}

/**
 * Screen x of the leading edge. Glides right with elapsed time while the track
 * has room; pinned EXACTLY to the right edge (`width - margin`) once scrolling
 * (computed as a min, not via the shift, so float cancellation can't make the
 * pinned head wobble). Never moves left: `progress` is monotonic.
 */
export function headScreenX(progress: number, widthPx: number): number {
  const raw = progress * SLOT_PITCH_PX + MARGIN_PX;
  const pin = widthPx - MARGIN_PX;
  return raw < pin ? raw : pin;
}

/**
 * First bucket index worth drawing for a given scroll offset. Includes one
 * bucket off the left edge so the smoothed curve stays continuous as it scrolls.
 */
export function firstVisibleIndex(shiftPx: number): number {
  const i = Math.floor((shiftPx - SLOT_PITCH_PX * 1.5) / SLOT_PITCH_PX);
  return i > 0 ? i : 0;
}

/**
 * Full stable layout for the current frame. `points` are only the visible
 * buckets, positioned at their fixed slots minus the scroll offset — no
 * resampling, no re-compression, so a bucket's x is identical before and after
 * later buckets arrive (until the track fills and everything scrolls as a unit).
 */
export function computeWaveformLayout(
  levels: readonly number[],
  widthPx: number,
  elapsedMs: number,
  bucketMs: number = WAVEFORM_BUCKET_MS,
): WaveformLayout {
  const n = levels.length;
  const progress = continuousProgress(elapsedMs, bucketMs);
  const shift = trackShiftPx(progress, widthPx);
  const headX = headScreenX(progress, widthPx);
  const start = firstVisibleIndex(shift);
  const points: WaveformPoint[] = [];
  for (let i = start; i < n; i++) {
    points.push({ x: bucketScreenX(i, shift), level: clamp01(levels[i] ?? 0) });
  }
  return { shift, full: shift > 0, headX, leaderFromX: headX, points };
}

/** A cubic bezier segment joining `p0`→`p1` through control points `c1`,`c2`. */
export interface Point {
  x: number;
  y: number;
}
export interface CubicSegment {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

/**
 * Catmull-Rom spline through `points` expressed as cubic bezier segments (one
 * per gap), so the envelope draws as a smooth filled curve. Endpoints clamp
 * (virtual points repeat the ends), giving natural tangents without overshoot.
 * A straight run of points yields collinear control points (no wobble).
 */
export function catmullRomToBezier(points: readonly Point[]): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const at = (i: number): Point =>
    points[i < 0 ? 0 : i > n - 1 ? n - 1 : i] as Point;
  const segments: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i);
    const p1 = at(i + 1);
    const prev = at(i - 1);
    const next = at(i + 2);
    segments.push({
      p0,
      c1: { x: p0.x + (p1.x - prev.x) / 6, y: p0.y + (p1.y - prev.y) / 6 },
      c2: { x: p1.x - (next.x - p0.x) / 6, y: p1.y - (next.y - p0.y) / 6 },
      p1,
    });
  }
  return segments;
}

/**
 * Half-height (px) of the envelope at a bucket: `level * maxHalf`, floored to a
 * hairline so silence reads as a thin center line rather than nothing.
 */
export function envelopeHalfHeight(
  level: number,
  maxHalf: number,
  minHalf: number,
): number {
  const h = clamp01(level) * maxHalf;
  return h > minHalf ? h : minHalf;
}
