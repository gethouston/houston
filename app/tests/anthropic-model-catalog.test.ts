import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getContextWindowConfig,
  getEffortLevels,
  getModel,
} from "../src/lib/providers.ts";

// Regression guards for HOU-618 (Sonnet 5 context window) plus the Fable 5
// picker restore. The Anthropic catalog is plain data, so these lock in the
// exact per-model context-window and effort facts that were wrong / absent.

describe("Sonnet 5 catalog (HOU-618)", () => {
  it("has a flat 1M context window — no 200k snap-up (unlike Sonnet 4.6)", () => {
    // Sonnet 5's 1M is the default AND only variant (no credit-gated 200k),
    // so default === max === 1M. The bug started the estimate at 200k by
    // copying Sonnet 4.6's credit-gated snap-up, which doesn't apply here.
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-sonnet-5"), {
      default: 1_000_000,
      max: 1_000_000,
    });
  });

  it("keeps all five effort levels including max", () => {
    // Anthropic's effort docs list Sonnet 5 for both `xhigh` and `max`, so
    // `max` stays in the picker (it is not an Opus-only level).
    deepStrictEqual(getEffortLevels("anthropic", "claude-sonnet-5"), [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});

describe("Sonnet 4.6 still credit-gates its 1M window", () => {
  it("starts at 200k and snaps up to 1M (unchanged by HOU-618)", () => {
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-sonnet-4-6"), {
      default: 200_000,
      max: 1_000_000,
    });
  });
});

describe("Fable 5 restored to the picker", () => {
  it("is present as the flagship model", () => {
    const fable = getModel("anthropic", "claude-fable-5");
    ok(fable, "claude-fable-5 should be in the Anthropic catalog");
    strictEqual(fable?.label, "Fable 5");
  });

  it("has a flat 1M context window like Opus 4.8", () => {
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-fable-5"), {
      default: 1_000_000,
      max: 1_000_000,
    });
  });

  it("accepts all five effort levels", () => {
    deepStrictEqual(getEffortLevels("anthropic", "claude-fable-5"), [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
