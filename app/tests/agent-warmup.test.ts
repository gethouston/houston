import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProvisioningEntry } from "../src/lib/agent-provisioning/entry.ts";
import { agentWarmup } from "../src/lib/agent-provisioning/warmup.ts";

const entry = (over: Partial<ProvisioningEntry> = {}): ProvisioningEntry => ({
  agentId: "a1",
  agentPath: "/ws/ada",
  since: 0,
  ...over,
});

// A phone opening a fresh hire's task list must say it is getting ready, not
// sit blank for the minutes a hosted warm-up takes.
describe("agentWarmup", () => {
  it("is ready with no warming entry for the AI Employee", () => {
    strictEqual(agentWarmup([], "/ws/ada"), "ready");
    strictEqual(
      agentWarmup([entry({ agentPath: "/ws/bo" })], "/ws/ada"),
      "ready",
    );
  });

  it("is warming while its entry is in its normal window", () => {
    strictEqual(agentWarmup([entry()], "/ws/ada"), "warming");
    strictEqual(
      agentWarmup([entry({ reason: "asleep" })], "/ws/ada"),
      "warming",
    );
  });

  it("is stalled once its entry ran past the window", () => {
    strictEqual(agentWarmup([entry({ timedOut: true })], "/ws/ada"), "stalled");
  });
});
