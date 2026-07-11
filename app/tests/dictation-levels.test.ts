import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  LEVEL_GAIN,
  LevelAccumulator,
  MAX_LEVEL_BUCKETS,
  rmsToLevel,
} from "../src/lib/dictation/levels.ts";

describe("rmsToLevel", () => {
  it("maps silence to 0", () => {
    strictEqual(rmsToLevel(0), 0);
  });

  it("clamps to 1 for loud input", () => {
    strictEqual(rmsToLevel(1), 1);
    strictEqual(rmsToLevel(5), 1);
  });

  it("applies the gain then a sqrt curve", () => {
    // rms where gain*rms == 0.25 -> sqrt -> 0.5
    const rms = 0.25 / LEVEL_GAIN;
    strictEqual(rmsToLevel(rms), 0.5);
  });

  it("lifts quiet speech above the noise floor", () => {
    // A mild curve keeps low-but-nonzero amplitude visible (> the raw value).
    ok(rmsToLevel(0.02) > 0.02);
  });

  it("never returns a negative level for negative garbage input", () => {
    strictEqual(rmsToLevel(-1), 0);
  });
});

describe("LevelAccumulator", () => {
  // 1000 Hz sample rate -> 100 samples per 100ms bucket (round numbers).
  const RATE = 1000;

  it("emits nothing until a whole bucket is filled", () => {
    const acc = new LevelAccumulator(RATE);
    acc.push(new Float32Array(50)); // half a bucket
    deepStrictEqual(acc.getLevels(), []);
  });

  it("emits one level per completed 100ms bucket", () => {
    const acc = new LevelAccumulator(RATE);
    acc.push(new Float32Array(250)); // 2.5 buckets -> 2 whole buckets
    strictEqual(acc.getLevels().length, 2);
  });

  it("computes the RMS-derived level for a constant-amplitude bucket", () => {
    const acc = new LevelAccumulator(RATE);
    // A full-scale square wave has RMS 1 -> level 1.
    acc.push(new Float32Array(100).fill(1));
    deepStrictEqual(Array.from(acc.getLevels()), [1]);
  });

  it("reads silence as a near-zero level", () => {
    const acc = new LevelAccumulator(RATE);
    acc.push(new Float32Array(100)); // all zeros
    deepStrictEqual(Array.from(acc.getLevels()), [0]);
  });

  it("splits samples across bucket boundaries that span frames", () => {
    const acc = new LevelAccumulator(RATE);
    acc.push(new Float32Array(60).fill(1));
    acc.push(new Float32Array(60).fill(1)); // 120 total -> 1 whole bucket
    strictEqual(acc.getLevels().length, 1);
    strictEqual(acc.getLevels()[0], 1);
  });

  it("caps the history at MAX_LEVEL_BUCKETS", () => {
    const acc = new LevelAccumulator(RATE);
    // (MAX + 10) buckets worth of samples.
    acc.push(new Float32Array((MAX_LEVEL_BUCKETS + 10) * 100));
    strictEqual(acc.getLevels().length, MAX_LEVEL_BUCKETS);
  });

  it("rounds samples-per-bucket from the real sample rate", () => {
    // 16 kHz -> 1600 samples per 100ms bucket.
    const acc = new LevelAccumulator(16000);
    acc.push(new Float32Array(1599));
    strictEqual(acc.getLevels().length, 0);
    acc.push(new Float32Array(1));
    strictEqual(acc.getLevels().length, 1);
  });
});
