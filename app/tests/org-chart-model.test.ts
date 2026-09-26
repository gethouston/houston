import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import type { UsageRow } from "@houston/engine-adapter";
import { orgChartUsage } from "../src/components/organization/org-chart-model.ts";

const agents = [
  { id: "writer", folderPath: "workspace/writer" },
  { id: "researcher", folderPath: "workspace/researcher" },
];
const row = (
  agentSlug: string,
  userId: string,
  messages: number,
): UsageRow => ({
  agentSlug,
  userId,
  messages,
  day: "2026-09-12",
});

test("chart totals resolve both agent ids and paths and retain unused agents", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", 2),
    row("workspace/writer", "bob", 3),
  ]);
  deepStrictEqual(
    [...usage.byAgent],
    [
      ["writer", 5],
      ["researcher", 0],
    ],
  );
});

test("inaccessible and deleted agents contribute to no chart metric", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", 2),
    row("hidden", "bob", 900),
  ]);
  strictEqual(usage.byAgent.get("writer"), 2);
});

test("invalid counts cannot corrupt every metric", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", Number.NaN),
    row("writer", "alice", -1),
    row("writer", "alice", Number.POSITIVE_INFINITY),
  ]);
  strictEqual(usage.byAgent.get("writer"), 0);
});

test("ungrouped agents share the chart usage scale with folder agents", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", 3),
    row("researcher", "bob", 8),
  ]);
  strictEqual(usage.byAgent.get("writer"), 3);
  strictEqual(usage.byAgent.get("researcher"), 8);
});
