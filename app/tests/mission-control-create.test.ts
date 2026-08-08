import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { planNewMission } from "../src/components/mission-control-create.ts";
import type { Agent } from "../src/lib/types.ts";

const agent: Agent = {
  id: "a1",
  name: "Ada",
  folderPath: "/ws/Personal/Ada",
  configId: "cfg",
  color: "#abcdef",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("planNewMission (issue #328)", () => {
  it("plans a create from a blank submit when an agent is active", () => {
    const plan = planNewMission({
      activeAgent: agent,
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4-6",
    });
    deepStrictEqual(plan, {
      kind: "create",
      agent,
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4-6",
    });
  });

  it("passes the composer's provider/model through untouched", () => {
    const plan = planNewMission({
      activeAgent: agent,
      providerOverride: "openai",
      modelOverride: "gpt-5.5",
    });
    deepStrictEqual(plan, {
      kind: "create",
      agent,
      providerOverride: "openai",
      modelOverride: "gpt-5.5",
    });
  });

  it("refuses to create when no agent is active (caller surfaces a toast)", () => {
    const plan = planNewMission({
      activeAgent: null,
      providerOverride: "anthropic",
      modelOverride: "claude-sonnet-4-6",
    });
    deepStrictEqual(plan, { kind: "no-agent" });
  });
});
