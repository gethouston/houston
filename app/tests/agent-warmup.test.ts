import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProvisioningEntry } from "../src/lib/agent-provisioning/entry.ts";
import {
  agentWarmup,
  SLOW_START_MS,
} from "../src/lib/agent-provisioning/warmup.ts";

const entry = (over: Partial<ProvisioningEntry> = {}): ProvisioningEntry => ({
  agentId: "a1",
  agentPath: "/ws/ada",
  since: 0,
  ...over,
});

describe("agentWarmup", () => {
  it("is ready with no warming entry for the AI Employee", () => {
    strictEqual(agentWarmup([], "/ws/ada", 0), "ready");
    strictEqual(
      agentWarmup([entry({ agentPath: "/ws/bo" })], "/ws/ada", 0),
      "ready",
    );
  });

  it("is warming while its entry is in its normal window", () => {
    strictEqual(agentWarmup([entry()], "/ws/ada", 0), "warming");
    strictEqual(
      agentWarmup([entry({ reason: "asleep" })], "/ws/ada", SLOW_START_MS - 1),
      "warming",
    );
  });

  it("is stalled once a start takes longer than usual", () => {
    strictEqual(agentWarmup([entry()], "/ws/ada", SLOW_START_MS), "stalled");
    strictEqual(
      agentWarmup([entry({ since: 1_000 })], "/ws/ada", 1_000 + SLOW_START_MS),
      "stalled",
    );
  });

  it("stays stalled after the probe timed out", () => {
    strictEqual(
      agentWarmup([entry({ since: 5_000, timedOut: true })], "/ws/ada", 5_000),
      "stalled",
    );
  });
});
