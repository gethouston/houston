import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { planNewMission } from "../src/components/mission-control-create.ts";
import type { Agent, AgentDefinition } from "../src/lib/types.ts";

const agent: Agent = {
  id: "a1",
  name: "Ada",
  folderPath: "/ws/Personal/Ada",
  configId: "cfg",
  color: "#abcdef",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const agentDefWithModes = {
  config: {
    agents: [
      { id: "default", name: "Default", promptFile: "default", createLabel: "New mission" },
      { id: "research", name: "Research", promptFile: "research", createLabel: "Research" },
    ],
  },
  source: "builtin",
} as unknown as AgentDefinition;

const agentDefNoModes = { config: {}, source: "builtin" } as unknown as AgentDefinition;

describe("planNewMission (issue #328)", () => {
  it("plans a create from a blank submit when an agent is active", () => {
    const plan = planNewMission({
      activeAgent: agent,
      activeAgentDef: agentDefWithModes,
      providerOverride: "anthropic",
      modelOverride: "sonnet",
    });
    deepStrictEqual(plan, {
      kind: "create",
      agent,
      agentMode: "default",
      promptFile: "default",
      providerOverride: "anthropic",
      modelOverride: "sonnet",
    });
  });

  it("creates with no mode when the agent declares none", () => {
    const plan = planNewMission({
      activeAgent: agent,
      activeAgentDef: agentDefNoModes,
      providerOverride: "openai",
      modelOverride: "gpt-5.5",
    });
    deepStrictEqual(plan, {
      kind: "create",
      agent,
      agentMode: undefined,
      promptFile: undefined,
      providerOverride: "openai",
      modelOverride: "gpt-5.5",
    });
  });

  it("refuses to create when no agent is active (caller surfaces a toast)", () => {
    const plan = planNewMission({
      activeAgent: null,
      activeAgentDef: null,
      providerOverride: "anthropic",
      modelOverride: "sonnet",
    });
    deepStrictEqual(plan, { kind: "no-agent" });
  });
});
