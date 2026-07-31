import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyWarmingSendPin } from "../src/lib/warming-send-pin.ts";

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
