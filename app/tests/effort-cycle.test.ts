import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { nextEffort } from "../src/lib/effort-cycle.ts";

const FULL = ["low", "medium", "high", "xhigh"] as const;
const PARTIAL = ["high", "xhigh"] as const;

describe("nextEffort", () => {
  it("advances to the next level low → … → xhigh", () => {
    strictEqual(nextEffort(FULL, "low"), "medium");
    strictEqual(nextEffort(FULL, "medium"), "high");
    strictEqual(nextEffort(FULL, "high"), "xhigh");
  });

  it("wraps past the last level back to the first", () => {
    strictEqual(nextEffort(FULL, "xhigh"), "low");
    strictEqual(nextEffort(PARTIAL, "xhigh"), "high");
  });

  it("starts at the first level when current is unset", () => {
    strictEqual(nextEffort(FULL, undefined), "low");
    strictEqual(nextEffort(FULL, null), "low");
    strictEqual(nextEffort(FULL, ""), "low");
  });

  it("starts at the first level when current isn't in this model's set", () => {
    strictEqual(nextEffort(PARTIAL, "low"), "high");
  });

  it("returns undefined when the model has no effort control", () => {
    strictEqual(nextEffort([], "low"), undefined);
    strictEqual(nextEffort([], undefined), undefined);
  });
});
