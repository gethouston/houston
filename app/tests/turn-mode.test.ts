import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_TURN_MODE,
  modeChangeAppliesNextTurn,
  normalizeTurnMode,
  readAgentTurnMode,
} from "../src/lib/turn-mode.ts";

// The composer "Mode" pin is loaded from per-agent config, which is untyped on
// disk. `normalizeTurnMode` is the read-side guard: only the three known mode
// strings pass through as-is; everything else falls back to the default mode
// so a stale or garbage value never strands the composer in an unknown mode.
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

  it("defaults to plan (fresh agents open in Planner)", () => {
    strictEqual(DEFAULT_TURN_MODE, "plan");
  });
});

// A Mode-pill pick can't touch the in-flight turn (its pin was stamped at
// send), so the composer shows an "applies to your next message" toast — but
// ONLY when a turn is actually running and the pick changes the mode.
describe("modeChangeAppliesNextTurn", () => {
  it("announces a real change while a turn is running", () => {
    strictEqual(modeChangeAppliesNextTurn(true, "execute", "plan"), true);
    strictEqual(modeChangeAppliesNextTurn(true, "plan", "auto"), true);
    strictEqual(modeChangeAppliesNextTurn(true, "auto", "execute"), true);
  });

  it("stays quiet when no turn is running (the pick applies immediately)", () => {
    strictEqual(modeChangeAppliesNextTurn(false, "execute", "plan"), false);
    strictEqual(modeChangeAppliesNextTurn(false, "plan", "auto"), false);
  });

  it("stays quiet when the pick re-selects the current mode", () => {
    strictEqual(modeChangeAppliesNextTurn(true, "plan", "plan"), false);
    strictEqual(modeChangeAppliesNextTurn(false, "auto", "auto"), false);
  });
});

describe("readAgentTurnMode", () => {
  it("reads and normalizes the agent's remembered mode", async () => {
    strictEqual(
      await readAgentTurnMode("Agent", async () => ({ mode: "plan" })),
      "plan",
    );
    strictEqual(
      await readAgentTurnMode("Agent", async () => ({ mode: "auto" })),
      "auto",
    );
    strictEqual(
      await readAgentTurnMode("Agent", async () => ({ mode: "execute" })),
      "execute",
    );
    strictEqual(
      await readAgentTurnMode("Agent", async () => ({ mode: "legacy" })),
      DEFAULT_TURN_MODE,
    );
    strictEqual(
      await readAgentTurnMode("Agent", async () => ({})),
      DEFAULT_TURN_MODE,
    );
  });

  it("falls back to the default mode when the config read fails", async () => {
    strictEqual(
      await readAgentTurnMode("Agent", async () => {
        throw new Error("missing config");
      }),
      DEFAULT_TURN_MODE,
    );
  });
});
