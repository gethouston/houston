import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { nextEffort } from "../src/lib/effort-cycle.ts";

// A model that accepts the full four-tier spectrum (e.g. Codex / Opus); xhigh is
// the top tier (the retired `max` is gone).
const FULL = ["low", "medium", "high", "xhigh"] as const;
// A two-level model (e.g. DeepSeek: high / xhigh).
const PARTIAL = ["high", "xhigh"] as const;

describe("nextEffort", () => {
  it("advances to the next level low → … → xhigh", () => {
    strictEqual(nextEffort(FULL, "low"), "medium");
    strictEqual(nextEffort(FULL, "medium"), "high");
    strictEqual(nextEffort(FULL, "high"), "xhigh");
  });

  it("wraps past the last level back to the first", () => {
    strictEqual(nextEffort(FULL, "xhigh"), "low");
    strictEqual(nextEffort(PARTIAL, "xhigh"), "high"); // wraps within its 2 levels
  });

  it("starts at the first level when current is unset", () => {
    strictEqual(nextEffort(FULL, undefined), "low");
    strictEqual(nextEffort(FULL, null), "low");
    strictEqual(nextEffort(FULL, ""), "low");
  });

  it("starts at the first level when current isn't in this model's set", () => {
    // e.g. an agent carrying `low` after switching to a high-only model.
    strictEqual(nextEffort(PARTIAL, "low"), "high");
  });

  it("returns undefined when the model has no effort control", () => {
    strictEqual(nextEffort([], "low"), undefined);
    strictEqual(nextEffort([], undefined), undefined);
  });
});
