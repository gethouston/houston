import { describe, expect, it } from "vitest";
import { needsAutocompact, resolveAutocompactThreshold } from "./autocompact";

describe("needsAutocompact", () => {
  it("compacts at and over the threshold", () => {
    expect(needsAutocompact(93_000, 100_000, 93)).toBe(true);
    expect(needsAutocompact(99_000, 100_000, 93)).toBe(true);
  });

  it("stays put under the threshold", () => {
    expect(needsAutocompact(92_000, 100_000, 93)).toBe(false);
    expect(needsAutocompact(0, 100_000, 93)).toBe(false);
  });

  it("compacts a 1M-window chat at 200k tokens, not at 93% of the window", () => {
    expect(needsAutocompact(199_999, 1_000_000, 93)).toBe(false);
    expect(needsAutocompact(200_000, 1_000_000, 93)).toBe(true);
    expect(needsAutocompact(900_000, 1_000_000, 93)).toBe(true);
  });

  it("keeps the 93% line on a window smaller than the ceiling", () => {
    expect(needsAutocompact(185_000, 200_000, 93)).toBe(false);
    expect(needsAutocompact(186_000, 200_000, 93)).toBe(true);
    expect(needsAutocompact(118_000, 128_000, 93)).toBe(false);
    expect(needsAutocompact(119_040, 128_000, 93)).toBe(true);
  });

  it("lets a low test override fire below the ceiling", () => {
    expect(needsAutocompact(50_000, 1_000_000, 5)).toBe(true);
  });

  it("never compacts without a reported fill or a sane window", () => {
    expect(needsAutocompact(null, 100_000, 93)).toBe(false);
    expect(needsAutocompact(93_000, 0, 93)).toBe(false);
  });
});

describe("resolveAutocompactThreshold", () => {
  it("defaults on missing or junk input", () => {
    expect(resolveAutocompactThreshold(undefined)).toBe(93);
    expect(resolveAutocompactThreshold("")).toBe(93);
    expect(resolveAutocompactThreshold("nope")).toBe(93);
    expect(resolveAutocompactThreshold("0")).toBe(93);
    expect(resolveAutocompactThreshold("250")).toBe(93);
  });

  it("honors a valid override (the force-compact test knob)", () => {
    expect(resolveAutocompactThreshold("5")).toBe(5);
    expect(resolveAutocompactThreshold("99")).toBe(99);
  });
});
