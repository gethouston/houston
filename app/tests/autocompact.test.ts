import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  contextFillPercent,
  resolveThreshold,
  shouldAutocompact,
} from "../src/lib/context-usage.ts";

const usage = (context_tokens: number) => ({
  context_tokens,
  output_tokens: 0,
  cached_tokens: 0,
});

describe("contextFillPercent", () => {
  it("rounds and clamps to 0-100", () => {
    strictEqual(contextFillPercent(usage(93_000), 100_000), 93);
    strictEqual(contextFillPercent(usage(925), 1000), 93); // 92.5 -> 93
    strictEqual(contextFillPercent(usage(250_000), 100_000), 100); // clamp
  });

  it("returns null when usage or window is missing", () => {
    strictEqual(contextFillPercent(null, 100_000), null);
    strictEqual(contextFillPercent(usage(1000), null), null);
    strictEqual(contextFillPercent(usage(1000), 0), null);
  });
});

describe("shouldAutocompact", () => {
  it("fires at or above the threshold when enabled", () => {
    strictEqual(shouldAutocompact({ percent: 93, enabled: true, threshold: 93 }), true);
    strictEqual(shouldAutocompact({ percent: 99, enabled: true, threshold: 93 }), true);
  });

  it("does not fire below the threshold", () => {
    strictEqual(shouldAutocompact({ percent: 92, enabled: true, threshold: 93 }), false);
  });

  it("never fires when disabled or usage unknown", () => {
    strictEqual(shouldAutocompact({ percent: 99, enabled: false, threshold: 93 }), false);
    strictEqual(shouldAutocompact({ percent: null, enabled: true, threshold: 93 }), false);
  });
});

describe("resolveThreshold", () => {
  it("defaults to 93 when unset, empty, or non-numeric", () => {
    strictEqual(resolveThreshold(undefined), 93);
    strictEqual(resolveThreshold(""), 93);
    strictEqual(resolveThreshold("abc"), 93);
  });

  it("rounds and clamps to [1, 99]", () => {
    strictEqual(resolveThreshold("80"), 80);
    strictEqual(resolveThreshold("85.6"), 86); // round
    strictEqual(resolveThreshold("0"), 1); // clamp floor
    strictEqual(resolveThreshold("-20"), 1); // clamp floor
    strictEqual(resolveThreshold("150"), 99); // clamp ceil
  });
});
