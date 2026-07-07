/**
 * Pure geometry for the dictation waveform track. No DOM — so the layout math
 * (how the amplitude history maps onto the elapsed portion of a fixed-width
 * track, and where the dotted remainder begins) is unit-testable without a
 * canvas (`tests/dictation-waveform-math.test.ts`).
 *
 * Model (matches the iOS-Messages reference): the track is a row of fixed-width
 * slots. The elapsed fraction of recording fills the left slots with amplitude
 * bars; the rest are drawn as a dotted leader toward the cap. Treating 30s as a
 * "full" track means short clips read as a mostly-dotted line and long clips
 * compress the history to keep the leading edge advancing smoothly.
 */

/** Elapsed time at which the bars fill the whole track (dots run out). */
export const WAVEFORM_FULL_TRACK_MS = 30_000;

/**
 * Fraction (0..1) of the track that should be amplitude bars for a given
 * elapsed time. Clamped: before the start it is 0, past `fullTrackMs` it is 1.
 */
export function elapsedBarFraction(
  elapsedMs: number,
  fullTrackMs: number = WAVEFORM_FULL_TRACK_MS,
): number {
  if (!(elapsedMs > 0) || fullTrackMs <= 0) return 0;
  return Math.min(1, elapsedMs / fullTrackMs);
}

/**
 * How many of `totalSlots` should render as bars for the given elapsed time.
 * The remainder are dots. Never exceeds `totalSlots`.
 */
export function elapsedBarCount(
  elapsedMs: number,
  totalSlots: number,
  fullTrackMs: number = WAVEFORM_FULL_TRACK_MS,
): number {
  if (totalSlots <= 0) return 0;
  return Math.min(
    totalSlots,
    Math.round(totalSlots * elapsedBarFraction(elapsedMs, fullTrackMs)),
  );
}

/**
 * Resample a level history down to exactly `target` bars using max-pooling, so
 * amplitude peaks survive the compression (a mean would wash the waveform
 * flat). When there are fewer levels than slots the history passes through
 * unchanged (early in a recording there simply aren't enough buckets yet).
 * Returns a fresh array; never mutates the input.
 */
export function downsampleLevels(
  levels: readonly number[],
  target: number,
): number[] {
  if (target <= 0) return [];
  const n = levels.length;
  if (n === 0) return [];
  if (n <= target) return levels.slice();
  const out = new Array<number>(target);
  for (let i = 0; i < target; i++) {
    const start = Math.floor((i * n) / target);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / target));
    let peak = 0;
    for (let j = start; j < end && j < n; j++) {
      const v = levels[j] ?? 0;
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}
