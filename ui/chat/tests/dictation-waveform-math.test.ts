import { deepEqual, equal } from "node:assert";
import { describe, it } from "node:test";
import {
  downsampleLevels,
  elapsedBarCount,
  elapsedBarFraction,
  WAVEFORM_FULL_TRACK_MS,
} from "../src/dictation-waveform-math.ts";

describe("elapsedBarFraction", () => {
  it("is 0 before the recording starts", () => {
    equal(elapsedBarFraction(0), 0);
    equal(elapsedBarFraction(-100), 0);
  });

  it("is the linear fraction of the full-track window", () => {
    equal(elapsedBarFraction(WAVEFORM_FULL_TRACK_MS / 2), 0.5);
    equal(elapsedBarFraction(WAVEFORM_FULL_TRACK_MS / 4), 0.25);
  });

  it("clamps to 1 past the full-track window", () => {
    equal(elapsedBarFraction(WAVEFORM_FULL_TRACK_MS), 1);
    equal(elapsedBarFraction(WAVEFORM_FULL_TRACK_MS * 3), 1);
  });
});

describe("elapsedBarCount", () => {
  it("is 0 when there are no slots", () => {
    equal(elapsedBarCount(WAVEFORM_FULL_TRACK_MS, 0), 0);
  });

  it("fills the elapsed fraction of the slots, rounded", () => {
    equal(elapsedBarCount(WAVEFORM_FULL_TRACK_MS / 2, 100), 50);
    equal(elapsedBarCount(WAVEFORM_FULL_TRACK_MS, 100), 100);
  });

  it("never exceeds the slot count", () => {
    equal(elapsedBarCount(WAVEFORM_FULL_TRACK_MS * 5, 40), 40);
  });
});

describe("downsampleLevels", () => {
  it("returns [] for an empty history or non-positive target", () => {
    deepEqual(downsampleLevels([], 10), []);
    deepEqual(downsampleLevels([0.5], 0), []);
  });

  it("passes the history through when it fits in the target", () => {
    const levels = [0.1, 0.2, 0.3];
    deepEqual(downsampleLevels(levels, 5), [0.1, 0.2, 0.3]);
  });

  it("does not mutate the input on pass-through", () => {
    const levels = [0.1, 0.2];
    const out = downsampleLevels(levels, 5);
    out[0] = 9;
    equal(levels[0], 0.1);
  });

  it("max-pools so peaks survive compression", () => {
    // 4 levels -> 2 bars: each bar is the max of its half.
    deepEqual(downsampleLevels([0.1, 0.9, 0.2, 0.3], 2), [0.9, 0.3]);
  });

  it("produces exactly `target` bars when downsampling", () => {
    const levels = Array.from({ length: 300 }, (_, i) => i / 300);
    equal(downsampleLevels(levels, 120).length, 120);
  });
});
