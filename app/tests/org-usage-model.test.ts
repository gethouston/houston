import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { UsageRow } from "@houston-ai/engine-client";
import {
  aggregateUsage,
  usageMax,
  usageTotal,
} from "../src/components/organization/org-usage-model.ts";

function row(
  agentSlug: string,
  userId: string,
  day: string,
  messages: number,
): UsageRow {
  return { agentSlug, userId, day, messages };
}

describe("org usage model", () => {
  it("rolls (agent,user,day) rows into per-agent totals with a per-person split", () => {
    const agents = aggregateUsage([
      row("sales", "u1", "2026-07-01", 3),
      row("sales", "u1", "2026-07-02", 2),
      row("sales", "u2", "2026-07-01", 10),
      row("support", "u1", "2026-07-01", 1),
    ]);

    deepStrictEqual(agents, [
      {
        agentSlug: "sales",
        messages: 15,
        people: [
          { userId: "u2", messages: 10 },
          { userId: "u1", messages: 5 },
        ],
      },
      {
        agentSlug: "support",
        messages: 1,
        people: [{ userId: "u1", messages: 1 }],
      },
    ]);
  });

  it("ignores zero/negative counters", () => {
    const agents = aggregateUsage([
      row("a", "u1", "d", 0),
      row("a", "u2", "d", -4),
      row("a", "u3", "d", 2),
    ]);
    deepStrictEqual(agents, [
      { agentSlug: "a", messages: 2, people: [{ userId: "u3", messages: 2 }] },
    ]);
  });

  it("breaks ties deterministically by id", () => {
    const agents = aggregateUsage([
      row("b", "u1", "d", 5),
      row("a", "u1", "d", 5),
    ]);
    deepStrictEqual(
      agents.map((a) => a.agentSlug),
      ["a", "b"],
    );
  });

  it("usageMax returns busiest total, never 0", () => {
    strictEqual(usageMax([]), 1);
    strictEqual(
      usageMax(aggregateUsage([row("a", "u", "d", 7), row("b", "u", "d", 3)])),
      7,
    );
  });

  it("usageTotal sums the window", () => {
    strictEqual(
      usageTotal(
        aggregateUsage([row("a", "u", "d", 7), row("b", "u", "d", 3)]),
      ),
      10,
    );
    strictEqual(usageTotal([]), 0);
  });
});
