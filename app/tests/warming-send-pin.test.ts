import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  preferRowPin,
  verifyWarmingSendPin,
} from "../src/lib/warming-send-pin.ts";

const pin = { provider: "anthropic", model: "sonnet", effort: "high" };

describe("warming send provider pin", () => {
  it("drops a missing provider and clears the activity pin", async () => {
    const cleared: Array<[string, string]> = [];
    const result = await verifyWarmingSendPin({
      agentId: "new-agent",
      activityId: "mission-1",
      pin,
      probe: async () => false,
      clearActivityPin: async (agent, activity) => {
        cleared.push([agent, activity]);
      },
    });
    assert.deepEqual(result, {});
    assert.deepEqual(cleared, [["new-agent", "mission-1"]]);
  });

  it("preserves a pin configured on the new pod", async () => {
    const result = await verifyWarmingSendPin({
      agentId: "new-agent",
      activityId: "mission-1",
      pin,
      probe: async () => true,
      clearActivityPin: async () => assert.fail("must not clear"),
    });
    assert.deepEqual(result, pin);
  });

  it("preserves a pin when the bounded probe times out", async () => {
    const result = await verifyWarmingSendPin({
      agentId: "new-agent",
      activityId: "mission-1",
      pin,
      timeoutMs: 1,
      probe: () => new Promise(() => {}),
      clearActivityPin: async () => assert.fail("must not clear"),
    });
    assert.deepEqual(result, pin);
  });
});

describe("preferRowPin (a parked follow-up flushes with the mission's own pin)", () => {
  it("takes the row's provider+model and keeps the send's effort", () => {
    assert.deepEqual(
      preferRowPin(
        { provider: "anthropic", model: "claude-opus-4-7" },
        { provider: "openai", model: "gpt-5.5", effort: "high" },
      ),
      { provider: "anthropic", model: "claude-opus-4-7", effort: "high" },
    );
  });

  it("normalizes a legacy alias stored on the row", () => {
    assert.deepEqual(
      preferRowPin({ provider: "anthropic", model: "opus" }, pin),
      { provider: "anthropic", model: "claude-opus-5", effort: "high" },
    );
  });

  it("keeps the send's pin when the row has none", () => {
    assert.deepEqual(preferRowPin({}, pin), pin);
    assert.deepEqual(preferRowPin(undefined, pin), pin);
  });

  it("keeps the send's pin when the row read found nothing", () => {
    assert.deepEqual(preferRowPin(undefined, {}), {});
  });
});
