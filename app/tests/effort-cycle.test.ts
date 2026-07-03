import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { nextEffort } from "../src/lib/effort-cycle.ts";

// Opus/Fable accept all five; Codex stops at xhigh (no max).
const FIVE = ["low", "medium", "high", "xhigh", "max"] as const;
const FOUR = ["low", "medium", "high", "xhigh"] as const;

describe("nextEffort", () => {
  it("advances to the next level low → … → max", () => {
    strictEqual(nextEffort(FIVE, "low"), "medium");
    strictEqual(nextEffort(FIVE, "medium"), "high");
    strictEqual(nextEffort(FIVE, "high"), "xhigh");
    strictEqual(nextEffort(FIVE, "xhigh"), "max");
  });

  it("wraps past the last level back to the first", () => {
    strictEqual(nextEffort(FIVE, "max"), "low");
    strictEqual(nextEffort(FOUR, "xhigh"), "low"); // Codex tops out at xhigh
  });

  it("starts at the first level when current is unset", () => {
    strictEqual(nextEffort(FIVE, undefined), "low");
    strictEqual(nextEffort(FIVE, null), "low");
    strictEqual(nextEffort(FIVE, ""), "low");
  });

  it("starts at the first level when current isn't in this model's set", () => {
    // e.g. an agent carrying `max` after switching to a Codex model.
    strictEqual(nextEffort(FOUR, "max"), "low");
  });

  it("returns undefined when the model has no effort control", () => {
    strictEqual(nextEffort([], "low"), undefined);
    strictEqual(nextEffort([], undefined), undefined);
  });
});
