import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_TURN_MODE,
  normalizeTurnMode,
  readAgentTurnMode,
} from "../src/lib/turn-mode.ts";

// The composer "Mode" pin is loaded from per-agent config, which is untyped on
// disk. `normalizeTurnMode` is the read-side guard: only the exact `"plan"` and
// `"auto"` strings pin a non-default mode; everything else falls back to execute
// so a stale or garbage value never strands the composer in an unknown mode.
describe("normalizeTurnMode", () => {
  it("keeps the three known modes", () => {
    strictEqual(normalizeTurnMode("plan"), "plan");
    strictEqual(normalizeTurnMode("auto"), "auto");
    strictEqual(normalizeTurnMode("execute"), "execute");
  });

  it("normalizes absent / unset values to execute", () => {
    strictEqual(normalizeTurnMode(undefined), "execute");
    strictEqual(normalizeTurnMode(null), "execute");
    strictEqual(normalizeTurnMode(""), "execute");
  });

  it("normalizes unknown / legacy / wrong-typed values to execute", () => {
    strictEqual(normalizeTurnMode("planning"), "execute");
    strictEqual(normalizeTurnMode("Plan"), "execute"); // case-sensitive
    strictEqual(normalizeTurnMode("Auto"), "execute"); // case-sensitive
    strictEqual(normalizeTurnMode("autopilot"), "execute");
    strictEqual(normalizeTurnMode("readonly"), "execute");
    strictEqual(normalizeTurnMode(42), "execute");
    strictEqual(normalizeTurnMode({ mode: "plan" }), "execute");
  });

  it("defaults to execute (unpinned turns are execute)", () => {
    strictEqual(DEFAULT_TURN_MODE, "execute");
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
      await readAgentTurnMode("Agent", async () => ({ mode: "legacy" })),
      "execute",
    );
    strictEqual(await readAgentTurnMode("Agent", async () => ({})), "execute");
  });

  it("falls back to execute when the config read fails", async () => {
    strictEqual(
      await readAgentTurnMode("Agent", async () => {
        throw new Error("missing config");
      }),
      "execute",
    );
  });
});
