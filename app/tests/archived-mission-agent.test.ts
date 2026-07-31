import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { latchMissionAgent } from "../src/lib/archived-mission-agent.ts";

const alpha = { folderPath: "/agents/alpha" };
const beta = { folderPath: "/agents/beta" };

/**
 * The archived → active handoff runs AFTER the send it follows resolves, and
 * that send re-activates the mission — so the archived list may already have
 * refetched without it. The agent has to have been captured before that.
 */
describe("latchMissionAgent", () => {
  it("holds the agent when the list drops the mission mid-flight", () => {
    // Mission open, list still has it.
    const latched = latchMissionAgent(null, "m1", alpha);
    strictEqual(latched, alpha);
    // The send re-activated it: the archived list refetches WITHOUT it, so the
    // live derivation is null. This is the race — the handoff must still know
    // which agent to focus.
    strictEqual(latchMissionAgent(latched, "m1", null), alpha);
  });

  it("forgets the agent as soon as the selection is dropped", () => {
    strictEqual(latchMissionAgent(alpha, null, null), null);
    // Even if a stale derivation is still around.
    strictEqual(latchMissionAgent(alpha, null, alpha), null);
  });

  it("follows the selection to another agent's mission", () => {
    strictEqual(latchMissionAgent(alpha, "m2", beta), beta);
  });

  it("is null while nothing has ever resolved", () => {
    strictEqual(latchMissionAgent(null, "m1", null), null);
  });
});
