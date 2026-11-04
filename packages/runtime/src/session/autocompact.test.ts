import { describe, expect, it } from "vitest";
import { needsAutocompact, resolveAutocompactOverride } from "./autocompact";

describe("needsAutocompact", () => {
  it("compacts at and over 93% of a small window", () => {
    expect(needsAutocompact(93_000, 100_000, undefined)).toBe(true);
    expect(needsAutocompact(99_000, 100_000, undefined)).toBe(true);
  });

  it("stays put under 93% of a small window", () => {
    expect(needsAutocompact(92_000, 100_000, undefined)).toBe(false);
    expect(needsAutocompact(0, 100_000, undefined)).toBe(false);
  });

  it("keeps the 93% line on a window smaller than the ceiling", () => {
    expect(needsAutocompact(185_000, 200_000, undefined)).toBe(false);
    expect(needsAutocompact(186_000, 200_000, undefined)).toBe(true);
    expect(needsAutocompact(118_000, 128_000, undefined)).toBe(false);
    expect(needsAutocompact(119_040, 128_000, undefined)).toBe(true);
  });

  it("compacts a window between the ceiling and 1M at 200k tokens", () => {
    expect(needsAutocompact(199_999, 500_000, undefined)).toBe(false);
    expect(needsAutocompact(200_000, 500_000, undefined)).toBe(true);
  });

  it("compacts a 1M-or-larger window at 93%, below the Claude CLI's 967k", () => {
    expect(needsAutocompact(200_000, 1_000_000, undefined)).toBe(false);
    expect(needsAutocompact(929_999, 1_000_000, undefined)).toBe(false);
    expect(needsAutocompact(930_000, 1_000_000, undefined)).toBe(true);
    expect(needsAutocompact(975_175, 1_048_576, undefined)).toBe(false);
    expect(needsAutocompact(975_176, 1_048_576, undefined)).toBe(true);
  });

  it("keeps the ceiling right below 1M", () => {
    expect(needsAutocompact(200_000, 999_999, undefined)).toBe(true);
  });

  it("lets a test override fire at a plain percent of any window", () => {
    expect(needsAutocompact(50_000, 1_000_000, 5)).toBe(true);
    expect(needsAutocompact(49_999, 1_000_000, 5)).toBe(false);
  });

  it("never compacts without a reported fill or a sane window", () => {
    expect(needsAutocompact(null, 100_000, undefined)).toBe(false);
    expect(needsAutocompact(93_000, 0, undefined)).toBe(false);
  });
});

describe("resolveAutocompactOverride", () => {
  it("is unset on missing or junk input", () => {
    expect(resolveAutocompactOverride(undefined)).toBeUndefined();
    expect(resolveAutocompactOverride("")).toBeUndefined();
    expect(resolveAutocompactOverride("nope")).toBeUndefined();
    expect(resolveAutocompactOverride("0")).toBeUndefined();
    expect(resolveAutocompactOverride("250")).toBeUndefined();
  });

  it("honors a valid override (the force-compact test knob)", () => {
    expect(resolveAutocompactOverride("5")).toBe(5);
    expect(resolveAutocompactOverride("99")).toBe(99);
  });
});
