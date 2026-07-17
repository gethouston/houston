import type { AdminReport } from "@houston/agentstore-client";
import { describe, expect, it } from "vitest";
import { groupByAgent } from "./reports-tab";

/** A report in the gateway's flat wire shape (no nested agent object). */
function report(overrides: Partial<AdminReport> = {}): AdminReport {
  return {
    id: "r1",
    reason: "spam",
    details: null,
    contact: null,
    status: "open",
    createdAt: "2026-07-09T00:00:00Z",
    agentId: "agent-1",
    agentSlug: "cool-agent",
    ...overrides,
  };
}

describe("groupByAgent", () => {
  it("buckets the gateway's flat reports by agentId without throwing", () => {
    const groups = groupByAgent([
      report({ id: "r1", agentId: "agent-1", agentSlug: "a-one" }),
      report({ id: "r2", agentId: "agent-1", agentSlug: "a-one" }),
      report({ id: "r3", agentId: "agent-2", agentSlug: "a-two" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ agentId: "agent-1", agentSlug: "a-one" });
    expect(groups[0]?.reports.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(groups[1]).toMatchObject({ agentId: "agent-2", agentSlug: "a-two" });
  });

  it("returns an empty list for no reports", () => {
    expect(groupByAgent([])).toEqual([]);
  });
});
