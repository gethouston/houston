import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import {
  personalDefaultTeamSeed,
  resolveServerTeams,
} from "../src/lib/server-teams-model.ts";
import {
  moveGroupOp,
  moveItemOp,
  toggleGroupCollapsedOp,
} from "../src/lib/sidebar-layout-ops.ts";
import { normalizeTeamOverlay } from "../src/lib/team-overlay.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

// The SERVER backend of `useTeams()` (C13). Each `it` is named for the merge
// rule it pins; the rules themselves are documented in the module.

const agent = (id: string): Agent =>
  ({ id, name: id, configId: "c", folderPath: `/w/${id}` }) as Agent;

/** A server team; `agentSlugs` are matched against `Agent.id` on the gateway. */
const serverTeam = (over: Partial<AgentTeam> & { id: string }): AgentTeam => ({
  name: over.id,
  isDefault: false,
  sortOrder: 0,
  agentSlugs: [],
  memberCount: 1,
  joined: true,
  owner: false,
  ...over,
});

const layout = (
  groups: SidebarLayout["groups"] = [],
  ungroupedOrder: string[] = [],
): SidebarLayout => ({ groups, ungroupedOrder });

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

const ids = (teams: readonly TeamView[]) => teams.map((t) => t.id);
const members = (team: TeamView | undefined) =>
  (team?.agents ?? []).map((a) => a.id);

describe("resolveServerTeams", () => {
  it("rule 1: teams come out in the server's order; the overlay never reorders teams", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t-b" }), serverTeam({ id: "t-a" })],
      [],
      // An overlay listing them the other way round must change nothing: it
      // orders agents INSIDE a team, never the teams themselves.
      layout([group("t-a", []), group("t-b", [])]),
    );
    assert.deepEqual(ids(teams), ["t-b", "t-a"]);
  });

  it("rule 2: agentSlugs resolve against the agent store by Agent.id", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["a", "b"] })],
      [agent("a"), agent("b")],
      layout(),
    );
    assert.deepEqual(members(teams[0]), ["a", "b"]);
  });

  it("rule 2: a slug with no agent row is dropped silently", () => {
    // Inventing a row for a slug we have no agent for would put a nameless
    // entry in the rail; the roster read is the authority on what can render.
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["ghost", "a", "ghost2"] })],
      [agent("a")],
      layout(),
    );
    assert.deepEqual(members(teams[0]), ["a"]);
  });

  it("rule 3: the overlay orders agents inside a team, server order fills the rest", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["a", "b", "c", "d"] })],
      [agent("a"), agent("b"), agent("c"), agent("d")],
      layout([group("t1", ["c", "a"])]),
    );
    assert.deepEqual(members(teams[0]), ["c", "a", "b", "d"]);
  });

  it("rule 3: an overlay naming an agent the team lost is ignored, not an error", () => {
    // A stale drag order after someone else moved the agent to another team.
    const teams = resolveServerTeams(
      [
        serverTeam({ id: "t1", agentSlugs: ["b"] }),
        serverTeam({ id: "t2", agentSlugs: ["a"] }),
      ],
      [agent("a"), agent("b")],
      layout([group("t1", ["a", "b"])]),
    );
    assert.deepEqual(members(teams[0]), ["b"]);
    assert.deepEqual(members(teams[1]), ["a"]);
  });

  it("rule 4: an agent no server team claims is appended to the default team", () => {
    // The roster read and the teams read are two requests: a just-created agent
    // is in one before the other, and the rail must never lose it.
    const teams = resolveServerTeams(
      [
        serverTeam({ id: "t1", agentSlugs: ["a"] }),
        serverTeam({ id: "t-def", isDefault: true, agentSlugs: ["b"] }),
      ],
      [agent("a"), agent("b"), agent("fresh"), agent("fresh2")],
      layout(),
    );
    assert.deepEqual(members(teams[1]), ["b", "fresh", "fresh2"]);
  });

  it("rule 4: with no default team in the response, leftovers are dropped", () => {
    // The client never invents a team.
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["a"] })],
      [agent("a"), agent("orphan")],
      layout(),
    );
    assert.deepEqual(ids(teams), ["t1"]);
    assert.deepEqual(members(teams[0]), ["a"]);
  });

  it("rule 5: server facts are copied verbatim, never re-derived", () => {
    const teams = resolveServerTeams(
      [
        serverTeam({
          id: "t-def",
          name: "Everyone",
          isDefault: true,
          sortOrder: 7,
          memberCount: 42,
          joined: true,
          owner: true,
        }),
      ],
      [],
      layout(),
    );
    assert.deepEqual(teams[0], {
      id: "t-def",
      name: "Everyone",
      agents: [],
      isDefault: true,
      server: { joined: true, owner: true, memberCount: 42, sortOrder: 7 },
    });
  });

  it("rule 5: the team's identity is copied verbatim off the wire too", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", icon: "rocket", color: "#5E6AD2" })],
      [],
      layout(),
    );
    assert.equal(teams[0]?.icon, "rocket");
    assert.equal(teams[0]?.color, "#5E6AD2");
  });

  it("marks only an untouched server default whose name matches the workspace", () => {
    const untouched = resolveServerTeams(
      [serverTeam({ id: "t-def", name: "Acme", isDefault: true })],
      [],
      layout(),
      "Acme",
    );
    const renamed = resolveServerTeams(
      [serverTeam({ id: "t-def", name: "Launch", isDefault: true })],
      [],
      layout(),
      "Acme",
    );
    assert.equal(untouched[0]?.usesDefaultIdentity, true);
    assert.equal(renamed[0]?.usesDefaultIdentity, undefined);
  });

  it("marks a personal default still wearing the seed the gateway minted", () => {
    // In a personal space the gateway mints the default team from the CALLER's
    // email local-part, never from the client's synthetic "Personal" workspace
    // name — the seed the caller passes is `personalDefaultTeamSeed`.
    const seed = personalDefaultTeamSeed({
      uid: "u-1",
      email: "hello@gethouston.ai",
    });
    const untouched = resolveServerTeams(
      [serverTeam({ id: "t-def", name: "hello", isDefault: true })],
      [],
      layout(),
      seed,
    );
    const renamed = resolveServerTeams(
      [serverTeam({ id: "t-def", name: "Mission HQ", isDefault: true })],
      [],
      layout(),
      seed,
    );
    assert.equal(untouched[0]?.usesDefaultIdentity, true);
    assert.equal(renamed[0]?.usesDefaultIdentity, undefined);
  });

  it("rule 5: an unset icon or color stays ABSENT, not undefined-valued", () => {
    // Absent is what tells the rail to draw its own default, and it is also how
    // the gateway spells "unset" — a key carrying `undefined` would answer
    // `"icon" in team` differently from the wire shape it mirrors.
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1" }), serverTeam({ id: "t2", icon: "book" })],
      [],
      layout(),
    );
    assert.equal("icon" in (teams[0] as TeamView), false);
    assert.equal("color" in (teams[0] as TeamView), false);
    // One field set does not conjure the other.
    assert.equal("color" in (teams[1] as TeamView), false);
  });

  it("a repeated slug inside one team renders the agent once", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["a", "a"] })],
      [agent("a")],
      layout(),
    );
    assert.deepEqual(members(teams[0]), ["a"]);
  });

  it("survives a corrupt stored overlay", () => {
    const teams = resolveServerTeams(
      [serverTeam({ id: "t1", agentSlugs: ["a"] })],
      [agent("a")],
      {
        groups: undefined,
        ungroupedOrder: undefined,
      } as unknown as SidebarLayout,
    );
    assert.deepEqual(members(teams[0]), ["a"]);
  });
});

describe("normalizeTeamOverlay", () => {
  const stored = layout(
    [
      group("t1", ["a", "moved", "ghost"], { collapsed: true, context: "ctx" }),
      group("grp_local", ["a"], { name: "Design", context: "the brand" }),
      group("t2", ["b"]),
    ],
    ["a", "b"],
  );
  const server = [
    serverTeam({ id: "t1", agentSlugs: ["a"] }),
    serverTeam({ id: "t2", agentSlugs: ["b"] }),
  ];

  it("rule 6: adjusts a live server team's row, keeping only agent ids that team holds", () => {
    const next = normalizeTeamOverlay(stored, server);
    assert.deepEqual(next.groups[0]?.agentIds, ["a"]);
  });

  it("rule 6: carries a stored group that is NOT a live server team through UNTOUCHED", () => {
    // The user's own local grouping. It names no server team, so there is
    // nothing to adjust it against, and deleting it would destroy work the
    // capability going away is supposed to hand straight back.
    const next = normalizeTeamOverlay(stored, server);
    const carried = next.groups.find((g) => g.id === "grp_local");
    assert.deepEqual(carried, stored.groups[1]);
  });

  it("rule 6: preserves group order, live and stored alike", () => {
    assert.deepEqual(
      normalizeTeamOverlay(stored, server).groups.map((g) => g.id),
      ["t1", "grp_local", "t2"],
    );
  });

  it("rule 6: a personal space's single team does not erase the user's local groups", () => {
    // The reviewer's scenario: a FRESH `agentTeams` personal space serves one
    // team, its default (it may create more, and the read serves them all —
    // only PEOPLE management is refused there), and every local group the user
    // built before the capability appeared names an id that team list does not
    // hold. One drag or one collapse used to persist them all away, names and
    // context with them.
    const before = layout([
      group("grp_design", ["a"], { name: "Design", context: "the brand" }),
      group("grp_ops", ["b"], { name: "Ops", collapsed: true }),
    ]);
    const personal = [
      serverTeam({ id: "t-default", isDefault: true, agentSlugs: ["a", "b"] }),
    ];
    const dropped = moveItemOp(before, "a", {
      groupId: "t-default",
      beforeItemId: "b",
    });
    const persisted = normalizeTeamOverlay(dropped, personal);
    assert.deepEqual(
      persisted.groups.find((g) => g.id === "grp_design"),
      {
        id: "grp_design",
        name: "Design",
        collapsed: false,
        agentIds: [],
        context: "the brand",
      },
    );
    assert.deepEqual(
      persisted.groups.find((g) => g.id === "grp_ops"),
      {
        id: "grp_ops",
        name: "Ops",
        collapsed: true,
        agentIds: ["b"],
      },
    );
    assert.deepEqual(
      persisted.groups.find((g) => g.id === "t-default")?.agentIds,
      ["a"],
    );
  });

  it("rule 6: the collapse toggle's write keeps the local groups too", () => {
    const before = layout([
      group("grp_design", ["a"], { name: "Design", context: "the brand" }),
    ]);
    const personal = [
      serverTeam({ id: "t-default", isDefault: true, agentSlugs: ["a"] }),
    ];
    const persisted = normalizeTeamOverlay(
      toggleGroupCollapsedOp(before, "t-default"),
      personal,
    );
    assert.deepEqual(persisted.groups[0], before.groups[0]);
    assert.equal(persisted.groups[1]?.collapsed, true);
  });

  it("rule 6: a group reorder's write keeps the local groups too", () => {
    const before = layout([
      group("t1", ["a"]),
      group("grp_design", [], { name: "Design", context: "the brand" }),
      group("t2", ["b"]),
    ]);
    const persisted = normalizeTeamOverlay(
      moveGroupOp(before, "t2", "t1"),
      server,
    );
    assert.deepEqual(
      persisted.groups.map((g) => g.id),
      ["t2", "t1", "grp_design"],
    );
    assert.deepEqual(
      persisted.groups.find((g) => g.id === "grp_design"),
      before.groups[1],
    );
  });

  it("rule 6: a BLANK overlay name on a live team is filled from the server's own", () => {
    // An upserted overlay row is born nameless (`blankOverlayGroup`), which is
    // fine while the capability is on (the server names its teams) and renders
    // a nameless block the moment it goes away. Filling it costs nothing and
    // makes the rollback honest.
    const before = layout([group("t1", ["a"], { name: "" })]);
    const named = [serverTeam({ id: "t1", name: "Growth", agentSlugs: ["a"] })];
    assert.equal(normalizeTeamOverlay(before, named).groups[0]?.name, "Growth");
  });

  it("rule 6: a name the user already set is never overwritten by the server's", () => {
    const before = layout([group("t1", ["a"], { name: "Mine" })]);
    const named = [serverTeam({ id: "t1", name: "Growth", agentSlugs: ["a"] })];
    assert.equal(normalizeTeamOverlay(before, named).groups[0]?.name, "Mine");
  });

  it("rule 6: leaves collapsed, context and ungroupedOrder untouched", () => {
    // Inert on a server host (only id/collapsed/agentIds are read), so
    // rewriting them would churn the stored preference for nothing.
    const next = normalizeTeamOverlay(stored, server);
    assert.equal(next.groups[0]?.collapsed, true);
    assert.equal(next.groups[0]?.context, "ctx");
    assert.deepEqual(next.ungroupedOrder, ["a", "b"]);
  });

  it("rule 6: does not mutate the layout it was handed", () => {
    normalizeTeamOverlay(stored, server);
    assert.equal(stored.groups.length, 3);
    assert.deepEqual(stored.groups[0]?.agentIds, ["a", "moved", "ghost"]);
  });

  it("rule 6: an empty server list leaves every stored group exactly as it was", () => {
    assert.deepEqual(normalizeTeamOverlay(stored, []).groups, stored.groups);
  });
});

// Byte-compatible with the gateway's `PersonalOrgName` + `DefaultAgentTeamName`
// (cloud `internal/store`): email local-part, trimmed, else the user id, capped
// at 60 RUNES.
describe("personalDefaultTeamSeed", () => {
  it("uses the email local-part", () => {
    assert.equal(
      personalDefaultTeamSeed({ uid: "u-1", email: "hello@gethouston.ai" }),
      "hello",
    );
  });

  it("falls back to the uid when the local-part is empty", () => {
    assert.equal(personalDefaultTeamSeed({ uid: "u-1", email: "" }), "u-1");
    assert.equal(
      personalDefaultTeamSeed({ uid: "u-1", email: "  @x.test" }),
      "u-1",
    );
  });

  it("treats an email-less string as the whole local-part", () => {
    assert.equal(
      personalDefaultTeamSeed({ uid: "u-1", email: "solo" }),
      "solo",
    );
  });

  it("caps at 60 runes, not bytes", () => {
    const seed = personalDefaultTeamSeed({
      uid: "u-1",
      email: `${"é".repeat(70)}@x.test`,
    });
    assert.equal(seed, "é".repeat(60));
  });

  it("answers undefined signed out", () => {
    assert.equal(personalDefaultTeamSeed(null), undefined);
    assert.equal(personalDefaultTeamSeed(undefined), undefined);
  });
});
