import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_TURN_MODE, normalizeTurnMode } from "../src/lib/turn-mode.ts";

// `normalizeTurnMode` remains the read-side guard for legacy/live pins: only
// the three known mode values may cross the UI boundary.
describe("normalizeTurnMode", () => {
  it("keeps the three known modes", () => {
    strictEqual(normalizeTurnMode("plan"), "plan");
    strictEqual(normalizeTurnMode("auto"), "auto");
    strictEqual(normalizeTurnMode("execute"), "execute");
  });

  it("normalizes absent / unset values to the default mode", () => {
    strictEqual(normalizeTurnMode(undefined), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(null), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(""), DEFAULT_TURN_MODE);
  });

  it("normalizes unknown / legacy / wrong-typed values to the default mode", () => {
    strictEqual(normalizeTurnMode("planning"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("Plan"), DEFAULT_TURN_MODE); // case-sensitive
    strictEqual(normalizeTurnMode("Auto"), DEFAULT_TURN_MODE); // case-sensitive
    strictEqual(normalizeTurnMode("autopilot"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode("readonly"), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode(42), DEFAULT_TURN_MODE);
    strictEqual(normalizeTurnMode({ mode: "plan" }), DEFAULT_TURN_MODE);
  });

  it("falls back to Ask First as the product default", () => {
    strictEqual(DEFAULT_TURN_MODE, "execute");
  });
});
