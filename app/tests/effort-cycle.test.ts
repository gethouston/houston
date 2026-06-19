import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { nextEffort } from "../src/lib/effort-cycle.ts";

// Opus accepts all five; Codex stops at xhigh and has no max level.
const FIVE = ["low", "medium", "high", "xhigh", "max"] as const;
const FOUR = ["low", "medium", "high", "xhigh"] as const;

describe("nextEffort", () => {
  it("advances to the next level from low through max", () => {
    strictEqual(nextEffort(FIVE, "low"), "medium");
    strictEqual(nextEffort(FIVE, "medium"), "high");
    strictEqual(nextEffort(FIVE, "high"), "xhigh");
    strictEqual(nextEffort(FIVE, "xhigh"), "max");
  });

  it("wraps past the last level back to the first", () => {
    strictEqual(nextEffort(FIVE, "max"), "low");
    strictEqual(nextEffort(FOUR, "xhigh"), "low");
  });

  it("starts at the first level when current is unset", () => {
    strictEqual(nextEffort(FIVE, undefined), "low");
    strictEqual(nextEffort(FIVE, null), "low");
    strictEqual(nextEffort(FIVE, ""), "low");
  });

  it("starts at the first level when current is not in this model set", () => {
    strictEqual(nextEffort(FOUR, "max"), "low");
  });

  it("returns undefined when the model has no effort control", () => {
    strictEqual(nextEffort([], "low"), undefined);
    strictEqual(nextEffort([], undefined), undefined);
  });
});
