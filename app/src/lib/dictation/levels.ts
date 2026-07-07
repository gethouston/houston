/**
 * Pure amplitude-metering helpers for the dictation waveform. No DOM, no Tauri
 * — the recorder (`recorder.ts`) feeds raw Float32 frames in, and this module
 * turns them into a compact per-100ms level history the composer renders as a
 * live waveform. Kept separate so the bucketing/normalization math runs under
 * the bare Node test runner (`app/tests/dictation-levels.test.ts`).
 */

/** One amplitude bucket per this many ms of captured audio. */
export const LEVEL_BUCKET_MS = 100;

/** Cap the history at the recorder's 120s ceiling (1200 buckets @ 100ms). */
export const MAX_LEVEL_BUCKETS = 1200;

/**
 * Gain applied before the perceptual curve. Raw speech RMS is small
 * (~0.05-0.15); this lifts normal speech toward the top of the 0..1 range
 * while leaving room silence near the floor.
 */
export const LEVEL_GAIN = 6;

/**
 * Map a raw RMS amplitude (>= 0) to a normalized 0..1 level. A sqrt curve
 * (after a mild gain) makes quiet speech visible without letting loud speech
 * clip the whole track. Deterministic, so it can be asserted byte-exact.
 */
export function rmsToLevel(rms: number): number {
  const boosted = Math.max(0, rms) * LEVEL_GAIN;
  return Math.min(1, Math.sqrt(boosted));
}

/**
 * DOM-free, streaming amplitude meter. Feed Float32 frames as they arrive from
 * the AudioWorklet; it emits one normalized 0..1 level per `bucketMs` window of
 * captured samples. The trailing partial bucket is intentionally NOT emitted
 * (only whole buckets), so the history length always matches elapsed time.
 */
export class LevelAccumulator {
  private readonly samplesPerBucket: number;
  private readonly levels: number[] = [];
  private sumSquares = 0;
  private count = 0;

  constructor(sampleRate: number, bucketMs: number = LEVEL_BUCKET_MS) {
    this.samplesPerBucket = Math.max(
      1,
      Math.round((sampleRate * bucketMs) / 1000),
    );
  }

  /** Fold a frame of mono samples into the running buckets. */
  push(frame: Float32Array): void {
    for (let i = 0; i < frame.length; i++) {
      const s = frame[i] ?? 0;
      this.sumSquares += s * s;
      this.count += 1;
      if (this.count >= this.samplesPerBucket) {
        if (this.levels.length < MAX_LEVEL_BUCKETS) {
          this.levels.push(rmsToLevel(Math.sqrt(this.sumSquares / this.count)));
        }
        this.sumSquares = 0;
        this.count = 0;
      }
    }
  }

  /** The amplitude history so far, one entry per completed 100ms bucket. */
  getLevels(): readonly number[] {
    return this.levels;
  }
}
