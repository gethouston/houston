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
