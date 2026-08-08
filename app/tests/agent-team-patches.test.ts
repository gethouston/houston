import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import {
  applyTeamSortOrder,
  crossTeamDropOverlay,
  moveAgentInTeams,
  teamSortOrderBetween,
} from "../src/lib/agent-team-patches.ts";

// The pure patches an OPTIMISTIC C13 write applies to the two caches one
// gesture touches: the server's teams, and the per-user ordering overlay.

const serverTeam = (over: Partial<AgentTeam> & { id: string }): AgentTeam => ({
  name: over.id,
  isDefault: false,
  sortOrder: 0,
  agentSlugs: [],
  memberCount: 1,
  joined: true,
  owner: true,
  ...over,
});

const group = (
  id: string,
  agentIds: string[],
  over: Partial<SidebarLayout["groups"][number]> = {},
): SidebarLayout["groups"][number] => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
  ...over,
});

describe("moveAgentInTeams", () => {
  const teams = [
    serverTeam({ id: "t-src", agentSlugs: ["a", "b"] }),
    serverTeam({ id: "t-dst", agentSlugs: ["x"] }),
  ];

  it("takes the agent out of every team holding it and appends it to the target", () => {
    const next = moveAgentInTeams(teams, "a", "t-dst");
    assert.deepEqual(next[0]?.agentSlugs, ["b"]);
    assert.deepEqual(next[1]?.agentSlugs, ["x", "a"]);
  });

  it("returns the untouched teams by identity, and never mutates its input", () => {
    const next = moveAgentInTeams(teams, "a", "t-dst");
    assert.notEqual(next[0], teams[0]);
    assert.deepEqual(teams[0]?.agentSlugs, ["a", "b"]);
    assert.deepEqual(teams[1]?.agentSlugs, ["x"]);
    // A team the move does not touch comes back by identity, so React Query's
    // structural sharing keeps the consumers that memoize on it.
    const elsewhere = moveAgentInTeams(teams, "zzz", "t-dst");
    assert.equal(elsewhere[0], teams[0]);
  });
});

describe("crossTeamDropOverlay", () => {
  const teams = [
    serverTeam({ id: "t-src", agentSlugs: ["a", "b"] }),
    serverTeam({ id: "t-dst", agentSlugs: ["x", "y"] }),
  ];
  const layout: SidebarLayout = {
    groups: [
      group("t-src", ["a", "b"]),
      group("t-dst", ["x", "y"]),
      group("grp_local", ["a"], { name: "Design", context: "the brand" }),
    ],
    ungroupedOrder: [],
  };

  it("keeps the DROP POSITION, because it prunes against the roster the move asserts", () => {
    // The whole point: normalized against the roster as it still STANDS, the
    // destination team does not hold the dropped agent yet, so the pruning rule
    // deletes the id the drop just wrote and the agent reappears appended.
    const next = crossTeamDropOverlay(layout, teams, "a", {
      groupId: "t-dst",
      beforeItemId: "y",
    });
    assert.deepEqual(next.groups.find((g) => g.id === "t-dst")?.agentIds, [
      "x",
      "a",
      "y",
    ]);
  });

  it("takes the agent out of the source block's order", () => {
    const next = crossTeamDropOverlay(layout, teams, "a", {
      groupId: "t-dst",
      beforeItemId: null,
    });
    assert.deepEqual(next.groups.find((g) => g.id === "t-src")?.agentIds, [
      "b",
    ]);
  });

  it("appends when the drop names no sibling to land before", () => {
    const next = crossTeamDropOverlay(layout, teams, "a", {
      groupId: "t-dst",
      beforeItemId: null,
    });
    assert.deepEqual(next.groups.find((g) => g.id === "t-dst")?.agentIds, [
      "x",
      "y",
      "a",
    ]);
  });

  it("carries a local group that is no server team through untouched", () => {
    const next = crossTeamDropOverlay(layout, teams, "b", {
      groupId: "t-dst",
      beforeItemId: "x",
    });
    assert.deepEqual(
      next.groups.find((g) => g.id === "grp_local"),
      layout.groups[2],
    );
  });

  it("leaves the layout it was handed intact, so a refusal can put it back", () => {
    // The rollback contract: the caller keeps the pre-drop layout as its
    // snapshot, and a `not_team_owner` 403 must restore the source block's
    // order exactly, not a copy this function quietly reordered.
    const before = structuredClone(layout);
    crossTeamDropOverlay(layout, teams, "a", {
      groupId: "t-dst",
      beforeItemId: "y",
    });
    assert.deepEqual(layout, before);
  });

  it("leaves the teams it was handed intact", () => {
    const before = structuredClone(teams);
    crossTeamDropOverlay(layout, teams, "a", {
      groupId: "t-dst",
      beforeItemId: "y",
    });
    assert.deepEqual(teams, before);
  });

  it("records the position even before the overlay has ever named the team", () => {
    // A server host's overlay starts EMPTY: the first drop into a team names an
    // id it does not hold yet, which upserts.
    const empty: SidebarLayout = { groups: [], ungroupedOrder: [] };
    const next = crossTeamDropOverlay(empty, teams, "a", {
      groupId: "t-dst",
      beforeItemId: null,
    });
    assert.deepEqual(next.groups.find((g) => g.id === "t-dst")?.agentIds, [
      "a",
    ]);
  });
});

describe("teamSortOrderBetween", () => {
  // The rail draws these in this order; the default team is drawn separately
  // as the trailing block and is never a drag source or a drop target.
  const teams = [
    serverTeam({ id: "t-default", isDefault: true, sortOrder: 0 }),
    serverTeam({ id: "a", sortOrder: 1 }),
    serverTeam({ id: "b", sortOrder: 2 }),
    serverTeam({ id: "c", sortOrder: 3 }),
  ];

  it("lands the team between the two it was dropped between", () => {
    // c dropped before b: neighbours are a(1) and b(2).
    assert.equal(teamSortOrderBetween(teams, "c", "b"), 1.5);
  });

  it("steps below the first team when dropped at the very top", () => {
    const two = [serverTeam({ id: "a", sortOrder: 1 }), teams[3] as AgentTeam];
    assert.equal(teamSortOrderBetween(two, "c", "a"), 0);
  });

  it("takes the default team as a neighbour, since the wire orders it too", () => {
    // The rail draws the default block separately and never lets it be
    // dragged, but the gateway sorts it with everything else.
    assert.equal(teamSortOrderBetween(teams, "c", "a"), 0.5);
  });

  it("steps above the last team when dropped at the end", () => {
    assert.equal(teamSortOrderBetween(teams, "a", null), 4);
  });

  it("answers null for a move that changes nothing", () => {
    // Dropped before the team it already sits in front of.
    assert.equal(teamSortOrderBetween(teams, "b", "c"), null);
    // Already last.
    assert.equal(teamSortOrderBetween(teams, "c", null), null);
  });

  it("answers null for a team the cache does not hold", () => {
    assert.equal(teamSortOrderBetween(teams, "ghost", null), null);
    assert.equal(teamSortOrderBetween([], "a", null), null);
  });

  it("treats an unknown `before` as the end of the list", () => {
    assert.equal(teamSortOrderBetween(teams, "a", "ghost"), 4);
  });
});

describe("applyTeamSortOrder", () => {
  const teams = [
    serverTeam({ id: "a", sortOrder: 1 }),
    serverTeam({ id: "b", sortOrder: 2 }),
    serverTeam({ id: "c", sortOrder: 3 }),
  ];

  it("re-sorts into the order the gateway will serve", () => {
    assert.deepEqual(
      applyTeamSortOrder(teams, "c", 1.5).map((t) => t.id),
      ["a", "c", "b"],
    );
  });

  it("carries the new sortOrder on the moved team and nothing else", () => {
    const next = applyTeamSortOrder(teams, "c", 1.5);
    assert.equal(next.find((t) => t.id === "c")?.sortOrder, 1.5);
    assert.equal(
      next.find((t) => t.id === "a"),
      teams[0],
    );
  });

  it("does not mutate the teams it was handed", () => {
    const before = structuredClone(teams);
    applyTeamSortOrder(teams, "c", 1.5);
    assert.deepEqual(teams, before);
  });

  it("breaks a sortOrder tie by the order the server already served", () => {
    // `Array.sort` is stable, and the cached array IS the server's order, so a
    // tie falls back to the gateway's own `(createdAt, id)` answer.
    assert.deepEqual(
      applyTeamSortOrder(teams, "c", 1).map((t) => t.id),
      ["a", "c", "b"],
    );
  });
});
