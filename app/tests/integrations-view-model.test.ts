import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { AgentChip } from "../src/components/integrations/agent-chip.ts";
import {
  accountAgentIds,
  agentChipsFor,
  partitionConnections,
  unionAgentIds,
} from "../src/components/integrations-view/integrations-view-model.ts";

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({ toolkit, connectionId: `c-${toolkit}`, status });

describe("accountAgentIds", () => {
  it("inverts per-agent grants into connectionId -> agent ids", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", ["conn-gmail-1", "conn-slack"]],
      ["a2", ["conn-gmail-1"]],
    ]);
    const result = accountAgentIds(byAgent);
    deepStrictEqual(
      [...result.entries()],
      [
        ["conn-gmail-1", ["a1", "a2"]],
        ["conn-slack", ["a1"]],
      ],
    );
  });

  it("keeps two accounts of one app independent", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", ["conn-gmail-work"]],
      ["a2", ["conn-gmail-personal"]],
    ]);
    const result = accountAgentIds(byAgent);
    deepStrictEqual(result.get("conn-gmail-work"), ["a1"]);
    deepStrictEqual(result.get("conn-gmail-personal"), ["a2"]);
  });

  it("skips agents with a null (unsupported) grant set", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", null],
      ["a2", ["conn-slack"]],
    ]);
    const result = accountAgentIds(byAgent);
    deepStrictEqual([...result.entries()], [["conn-slack", ["a2"]]]);
  });

  it("returns an empty map when no agent has grants", () => {
    const byAgent = new Map<string, string[] | null>([
      ["a1", []],
      ["a2", null],
    ]);
    deepStrictEqual([...accountAgentIds(byAgent).entries()], []);
  });

  it("preserves agent-id insertion order", () => {
    const byAgent = new Map<string, string[] | null>([
      ["z", ["conn-gmail"]],
      ["a", ["conn-gmail"]],
    ]);
    deepStrictEqual(accountAgentIds(byAgent).get("conn-gmail"), ["z", "a"]);
  });
});

describe("unionAgentIds", () => {
  const byConnection = new Map<string, string[]>([
    ["c1", ["a1", "a2"]],
    ["c2", ["a2", "a3"]],
    ["c3", []],
  ]);

  it("unions the agents across an app's accounts, first-seen order", () => {
    deepStrictEqual(unionAgentIds(["c1", "c2"], byConnection), [
      "a1",
      "a2",
      "a3",
    ]);
  });

  it("de-duplicates an agent granted on several accounts", () => {
    deepStrictEqual(unionAgentIds(["c2", "c1"], byConnection), [
      "a2",
      "a3",
      "a1",
    ]);
  });

  it("treats an ungranted account as contributing nothing", () => {
    deepStrictEqual(unionAgentIds(["c3", "c1"], byConnection), ["a1", "a2"]);
  });

  it("returns an empty array for no accounts", () => {
    deepStrictEqual(unionAgentIds([], byConnection), []);
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
