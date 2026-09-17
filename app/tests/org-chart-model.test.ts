import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import type { OrgMember, UsageRow } from "@houston/engine-adapter";
import {
  orgChartMembers,
  orgChartUsage,
} from "../src/components/organization/org-chart-model.ts";

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
  deepStrictEqual(
    [...usage.byPerson],
    [
      ["alice", 2],
      ["bob", 3],
    ],
  );
});

test("inaccessible and deleted agents contribute to no chart metric", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", 2),
    row("hidden", "bob", 900),
  ]);
  deepStrictEqual([...usage.byPerson], [["alice", 2]]);
  strictEqual(usage.byAgent.get("writer"), 2);
});

test("invalid counts cannot corrupt every metric", () => {
  const usage = orgChartUsage(agents, [
    row("writer", "alice", Number.NaN),
    row("writer", "alice", -1),
    row("writer", "alice", Number.POSITIVE_INFINITY),
  ]);
  strictEqual(usage.byAgent.get("writer"), 0);
  strictEqual(usage.byPerson.size, 0);
});

const roster: OrgMember[] = [
  { userId: "alice", role: "owner", displayName: "Alice" },
  { userId: "bob", role: "user", displayName: "Bob" },
];

test("named teams show membership without inventing reporting relationships", () => {
  const members = orgChartMembers({
    isDefault: false,
    personal: false,
    roster,
    members: [{ userId: "bob", owner: false }],
  });
  deepStrictEqual(members, [roster[1]]);
});

test("default teams include every person without explicit membership rows", () => {
  deepStrictEqual(
    orgChartMembers({ isDefault: true, personal: false, roster, members: [] }),
    roster,
  );
});

test("a personal team shows its single human without requesting memberships", () => {
  deepStrictEqual(
    orgChartMembers({
      isDefault: false,
      personal: true,
      roster: [roster[0]],
      members: [],
    }),
    [roster[0]],
  );
});
