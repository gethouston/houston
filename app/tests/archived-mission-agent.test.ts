import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { latchMissionAgent } from "../src/lib/archived-mission-agent.ts";

const alpha = { folderPath: "/agents/alpha" };
const beta = { folderPath: "/agents/beta" };

describe("latchMissionAgent", () => {
  it("holds the agent when the list drops the mission mid-flight", () => {
    const latched = latchMissionAgent(null, "m1", alpha);
    strictEqual(latched, alpha);
    strictEqual(latchMissionAgent(latched, "m1", null), alpha);
  });

  it("forgets the agent as soon as the selection is dropped", () => {
    strictEqual(latchMissionAgent(alpha, null, null), null);
    strictEqual(latchMissionAgent(alpha, null, alpha), null);
  });

  it("follows the selection to another agent's mission", () => {
    strictEqual(latchMissionAgent(alpha, "m2", beta), beta);
  });

  it("is null while nothing has ever resolved", () => {
    strictEqual(latchMissionAgent(null, "m1", null), null);
  });
});
