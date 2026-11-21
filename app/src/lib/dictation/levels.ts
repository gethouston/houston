export const LEVEL_BUCKET_MS = 100;

export const MAX_LEVEL_BUCKETS = 1200;

export const LEVEL_GAIN = 6;

export function rmsToLevel(rms: number): number {
  const boosted = Math.max(0, rms) * LEVEL_GAIN;
  return Math.min(1, Math.sqrt(boosted));
}

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

  getLevels(): readonly number[] {
    return this.levels;
  }
}
