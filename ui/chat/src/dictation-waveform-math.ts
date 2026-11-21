export const SLOT_PITCH_PX = 5;

export const WAVEFORM_BUCKET_MS = 100;

const MARGIN_PX = SLOT_PITCH_PX / 2;

export interface WaveformPoint {
  x: number;
  level: number;
}

export interface WaveformLayout {
  shift: number;
  full: boolean;
  headX: number;
  leaderFromX: number;
  points: WaveformPoint[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function visibleSlotCount(widthPx: number): number {
  return Math.max(1, Math.floor(widthPx / SLOT_PITCH_PX));
}

export function continuousProgress(
  elapsedMs: number,
  bucketMs: number = WAVEFORM_BUCKET_MS,
): number {
  if (!(elapsedMs > 0) || bucketMs <= 0) return 0;
  return elapsedMs / bucketMs;
}

export function trackShiftPx(progress: number, widthPx: number): number {
  const raw = progress * SLOT_PITCH_PX + MARGIN_PX * 2 - widthPx;
  return raw > 0 ? raw : 0;
}

export function bucketScreenX(index: number, shiftPx: number): number {
  return index * SLOT_PITCH_PX + MARGIN_PX - shiftPx;
}

export function headScreenX(progress: number, widthPx: number): number {
  const raw = progress * SLOT_PITCH_PX + MARGIN_PX;
  const pin = widthPx - MARGIN_PX;
  return raw < pin ? raw : pin;
}

export function firstVisibleIndex(shiftPx: number): number {
  const i = Math.floor((shiftPx - SLOT_PITCH_PX * 1.5) / SLOT_PITCH_PX);
  return i > 0 ? i : 0;
}

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

export function envelopeHalfHeight(
  level: number,
  maxHalf: number,
  minHalf: number,
): number {
  const h = clamp01(level) * maxHalf;
  return h > minHalf ? h : minHalf;
}
