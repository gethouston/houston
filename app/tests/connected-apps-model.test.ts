import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { AgentChip } from "../src/components/integrations/agent-chip.ts";
import {
  agentChipsFor,
  partitionConnections,
  toolkitAgentIds,
} from "../src/components/integrations/connected-apps-model.ts";

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({ toolkit, connectionId: `c-${toolkit}`, status });

describe("toolkitAgentIds", () => {
  it("inverts per-agent grants into toolkit -> agent ids", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", ["gmail", "slack"]],
      ["a2", ["gmail"]],
    ]);
    const result = toolkitAgentIds(byAgent);
    deepStrictEqual(
      [...result.entries()],
      [
        ["gmail", ["a1", "a2"]],
        ["slack", ["a1"]],
      ],
    );
  });

  it("skips agents with a null (unsupported) grant set", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", null],
      ["a2", ["slack"]],
    ]);
    const result = toolkitAgentIds(byAgent);
    deepStrictEqual([...result.entries()], [["slack", ["a2"]]]);
  });

  it("returns an empty map when no agent has grants", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", []],
      ["a2", null],
    ]);
    deepStrictEqual([...toolkitAgentIds(byAgent).entries()], []);
  });

  it("preserves agent-id insertion order", () => {
    const byAgent = new Map<string, string[] | null>([
      ["z", ["gmail"]],
      ["a", ["gmail"]],
    ]);
    deepStrictEqual(toolkitAgentIds(byAgent).get("gmail"), ["z", "a"]);
  });
});

describe("agentChipsFor", () => {
  const byId = new Map<string, AgentChip>([
    ["a1", { id: "a1", name: "Alpha" }],
    ["a2", { id: "a2", name: "Beta", color: "navy" }],
  ]);

  it("resolves ids to chips preserving order", () => {
    deepStrictEqual(agentChipsFor(["a2", "a1"], byId), [
      { id: "a2", name: "Beta", color: "navy" },
      { id: "a1", name: "Alpha" },
    ]);
  });

  it("drops ids with no matching chip", () => {
    deepStrictEqual(agentChipsFor(["a1", "ghost"], byId), [
      { id: "a1", name: "Alpha" },
    ]);
  });

  it("returns an empty array for no ids", () => {
    deepStrictEqual(agentChipsFor([], byId), []);
  });
});

describe("partitionConnections", () => {
  it("splits active from pending/error, preserving order", () => {
    const connections = [
      conn("gmail", "active"),
      conn("slack", "pending"),
      conn("notion", "error"),
      conn("linear", "active"),
    ];
    const { active, recovering } = partitionConnections(connections);
    deepStrictEqual(
      active.map((c) => c.toolkit),
      ["gmail", "linear"],
    );
    deepStrictEqual(
      recovering.map((c) => c.toolkit),
      ["slack", "notion"],
    );
  });

  it("handles an empty list", () => {
    deepStrictEqual(partitionConnections([]), { active: [], recovering: [] });
  });
});
