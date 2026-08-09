import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTeam } from "@houston-ai/engine-client";
import {
  applyTeamIdentity,
  applyTeamSortOrder,
  moveAgentInTeams,
  teamSortOrderBetween,
} from "../src/lib/agent-team-patches.ts";

// The pure patches an OPTIMISTIC C13 write applies to the cached teams.

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

describe("applyTeamIdentity", () => {
  // The picker LIVE-APPLIES a choice, so this has to patch the cache the way
  // the gateway will patch the row: `""` clears, another string sets, an
  // omitted field is untouched.
  const teams = [
    serverTeam({ id: "a", icon: "book", color: "#5E6AD2" }),
    serverTeam({ id: "b" }),
  ];

  it("sets a field, on a team that had none", () => {
    const next = applyTeamIdentity(teams, "b", { icon: "rocket" });
    assert.equal(next[1]?.icon, "rocket");
  });

  it("replaces a field the team already carried", () => {
    const next = applyTeamIdentity(teams, "a", { color: "indigo-500" });
    assert.equal(next[0]?.color, "indigo-500");
  });

  it("CLEARS a field on the empty string, leaving it ABSENT", () => {
    // Not `undefined`-valued: unset is absent on the wire, so a cached team
    // must answer `"icon" in team` the way the next read will.
    const next = applyTeamIdentity(teams, "a", { icon: "" });
    assert.equal("icon" in (next[0] as AgentTeam), false);
  });

  it("leaves the sibling field alone when the patch omits it", () => {
    assert.equal(
      applyTeamIdentity(teams, "a", { icon: "" })[0]?.color,
      "#5E6AD2",
    );
    assert.equal(applyTeamIdentity(teams, "a", { color: "" })[0]?.icon, "book");
    assert.equal(applyTeamIdentity(teams, "a", {})[0]?.icon, "book");
    assert.equal(applyTeamIdentity(teams, "a", {})[0]?.color, "#5E6AD2");
  });

  it("sets both fields in one patch", () => {
    const next = applyTeamIdentity(teams, "b", {
      icon: "flask",
      color: "forest",
    });
    assert.equal(next[1]?.icon, "flask");
    assert.equal(next[1]?.color, "forest");
  });

  it("leaves the list unchanged for a team id the cache does not hold", () => {
    const next = applyTeamIdentity(teams, "ghost", { icon: "star" });
    assert.deepEqual(next, teams);
    // Untouched teams come back by identity, so React Query's structural
    // sharing keeps the consumers that memoize on them.
    assert.equal(next[0], teams[0]);
    assert.equal(next[1], teams[1]);
  });

  it("does not mutate the teams it was handed, so a refusal can put them back", () => {
    const before = structuredClone(teams);
    applyTeamIdentity(teams, "a", { icon: "", color: "star" });
    assert.deepEqual(teams, before);
  });

  it("keeps every other field of the patched team", () => {
    const next = applyTeamIdentity(
      [serverTeam({ id: "a", agentSlugs: ["x"], sortOrder: 3, icon: "book" })],
      "a",
      { icon: "" },
    );
    assert.deepEqual(next[0]?.agentSlugs, ["x"]);
    assert.equal(next[0]?.sortOrder, 3);
  });
});
