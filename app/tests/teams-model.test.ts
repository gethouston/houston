import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities, SidebarLayout } from "@houston-ai/engine-client";
import {
  blockedTeamView,
  canDeleteTeam,
  canJoinTeam,
  canLeaveTeam,
  canRenameTeam,
  canSeeTeamSettings,
  DEFAULT_TEAM_ID,
  resolveTeamSection,
  resolveTeams,
  type ServerTeamFacts,
  sectionHonorsAgentPin,
  TEAM_VIEW_ID,
  type TeamView,
  teamById,
  teamOfAgent,
  visibleTeamSectionsForTeam,
} from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string, access?: Agent["access"]): Agent =>
  ({ id, name: id, ...(access === undefined ? {} : { access }) }) as Agent;

/** A team holding exactly these agents (a named group unless told otherwise). */
const team = (agents: Agent[], over: Partial<TeamView> = {}): TeamView => ({
  id: "g1",
  name: "Sales",
  agents,
  isDefault: false,
  ...over,
});

/** C13 server facts. Their PRESENCE is what switches every rule to the server
 *  backend; a team without them is a local sidebar group, as before. */
const facts = (over: Partial<ServerTeamFacts> = {}): ServerTeamFacts => ({
  joined: true,
  owner: false,
  memberCount: 1,
  sortOrder: 0,
  ...over,
});

const layout = (
  groups: SidebarLayout["groups"],
  ungroupedOrder: string[] = [],
): SidebarLayout => ({
  groups,
  ungroupedOrder,
});

const caps = (over: Partial<Capabilities>): Capabilities =>
  over as Capabilities;

describe("resolveTeams", () => {
  it("maps named groups to teams and ungrouped agents to the trailing default team", () => {
    const teams = resolveTeams(
      [agent("a"), agent("b"), agent("c")],
      layout([{ id: "g1", name: "Sales", agentIds: ["b"] }], ["c", "a"]),
      "Acme",
    );
    assert.deepEqual(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        agents: t.agents.map((a) => a.id),
        isDefault: t.isDefault,
      })),
      [
        { id: "g1", name: "Sales", agents: ["b"], isDefault: false },
        {
          id: DEFAULT_TEAM_ID,
          name: "Acme",
          agents: ["c", "a"],
          isDefault: true,
        },
      ],
    );
  });

  it("renders the default team even when every agent is grouped, and when there are no agents", () => {
    const grouped = resolveTeams(
      [agent("a")],
      layout([{ id: "g1", name: "Ops", agentIds: ["a"] }]),
      "Acme",
    );
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped[1], {
      id: DEFAULT_TEAM_ID,
      name: "Acme",
      agents: [],
      isDefault: true,
    });
    assert.deepEqual(resolveTeams([], layout([]), "Solo")[0]?.agents, []);
  });

  it("every agent belongs to exactly one team (first group wins, stale ids dropped)", () => {
    const teams = resolveTeams(
      [agent("a"), agent("b")],
      layout([
        { id: "g1", name: "One", agentIds: ["a", "ghost"] },
        { id: "g2", name: "Two", agentIds: ["a"] },
      ]),
      "Acme",
    );
    const owners = ["a", "b"].map((id) => teamOfAgent(teams, id)?.id);
    assert.deepEqual(owners, ["g1", DEFAULT_TEAM_ID]);
    assert.equal(teams.find((t) => t.id === "g2")?.agents.length, 0);
  });

  it("teamById resolves both stored and virtual ids", () => {
    const teams = resolveTeams(
      [agent("a")],
      layout([{ id: "g1", name: "One", agentIds: [] }]),
      "Acme",
    );
    assert.equal(teamById(teams, "g1")?.name, "One");
    assert.equal(teamById(teams, DEFAULT_TEAM_ID)?.isDefault, true);
    assert.equal(teamById(teams, "missing"), null);
  });
});

describe("canSeeTeamSettings", () => {
  it("single-player always sees Team Settings", () => {
    assert.equal(canSeeTeamSettings(null), true);
    assert.equal(canSeeTeamSettings(caps({})), true);
  });

  it("multiplayer gates on owner/admin and denies plain members", () => {
    assert.equal(
      canSeeTeamSettings(caps({ multiplayer: true, role: "owner" })),
      true,
    );
    assert.equal(
      canSeeTeamSettings(caps({ multiplayer: true, role: "admin" })),
      true,
    );
    assert.equal(
      canSeeTeamSettings(caps({ multiplayer: true, role: "user" })),
      false,
    );
    assert.equal(canSeeTeamSettings(caps({ multiplayer: true })), false);
  });
});

describe("visibleTeamSectionsForTeam", () => {
  const WORK = ["mission-control", "routines", "files"] as const;
  const ALL = [...WORK, "settings"] as const;
  const MEMBER = caps({ multiplayer: true, role: "user" });

  it("gives the team's WORK to everyone, in a stable order, Settings last", () => {
    assert.deepEqual(
      visibleTeamSectionsForTeam(MEMBER, team([agent("a", "user")])),
      [...WORK],
    );
    assert.deepEqual(
      visibleTeamSectionsForTeam(MEMBER, team([agent("a", "manager")])),
      [...ALL],
    );
  });

  it("single-player always gets Team Settings, on any team", () => {
    assert.deepEqual(visibleTeamSectionsForTeam(null, team([agent("a")])), [
      ...ALL,
    ]);
    assert.deepEqual(visibleTeamSectionsForTeam(caps({}), team([])), [...ALL]);
  });

  it("the org owner/admin gets Team Settings on every team, even an empty one", () => {
    for (const role of ["owner", "admin"] as const) {
      const c = caps({ multiplayer: true, role });
      assert.deepEqual(
        visibleTeamSectionsForTeam(c, team([agent("a", "user")])),
        [...ALL],
        role,
      );
      assert.deepEqual(visibleTeamSectionsForTeam(c, team([])), [...ALL], role);
    }
  });

  it("a member who MANAGES one of this team's agents gets Team Settings", () => {
    // The bug this rule fixes: a `role:"user"` holding `access:"manager"` on an
    // agent lost every configure surface, because Team Settings is the ONE door
    // to the agent settings page and it was gated org-wide.
    const sections = visibleTeamSectionsForTeam(
      MEMBER,
      team([agent("a", "user"), agent("b", "manager")]),
    );
    assert.equal(sections.includes("settings"), true);
  });

  it("the same member gets NO Team Settings on a team they only use", () => {
    for (const agents of [
      [] as Agent[],
      [agent("a", "user")],
      [agent("a", "user"), agent("b", "user")],
      // No `access` at all: a stale/partial wire row must never widen power.
      [agent("a")],
    ]) {
      const sections = visibleTeamSectionsForTeam(MEMBER, team(agents));
      assert.deepEqual(sections, [...WORK], JSON.stringify(agents));
    }
  });

  it("is decided PER TEAM: the same caller differs team to team", () => {
    const managed = team([agent("a", "manager")], { id: "g1" });
    const used = team([agent("b", "user")], { id: "g2" });
    assert.equal(
      visibleTeamSectionsForTeam(MEMBER, managed).includes("settings"),
      true,
    );
    assert.equal(
      visibleTeamSectionsForTeam(MEMBER, used).includes("settings"),
      false,
    );
  });

  it("holds for the default team too (the workspace's own)", () => {
    const def = team([agent("a", "manager")], {
      id: DEFAULT_TEAM_ID,
      isDefault: true,
    });
    assert.deepEqual(visibleTeamSectionsForTeam(MEMBER, def), [...ALL]);
  });

  it("on a SERVER team the org-role half is replaced by the server's owner flag", () => {
    // An explicit team owner configures their team without being an org admin.
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        MEMBER,
        team([agent("a", "user")], { server: facts({ owner: true }) }),
      ),
      [...ALL],
    );
    // And the reverse: the server's `owner: false` wins over the client's
    // org-role guess. A real admin never gets that row (the gateway marks them
    // owner of every team) -- which is exactly why the client must not re-derive.
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        caps({ multiplayer: true, role: "admin" }),
        team([agent("a", "user")], { server: facts({ owner: false }) }),
      ),
      [...WORK],
    );
  });

  it("the agent-manager clause survives the server switch", () => {
    const sections = visibleTeamSectionsForTeam(
      MEMBER,
      team([agent("a", "user"), agent("b", "manager")], {
        server: facts({ owner: false }),
      }),
    );
    assert.equal(sections.includes("settings"), true);
  });
});

describe("resolveTeamSection", () => {
  const admin = visibleTeamSectionsForTeam(null, team([agent("a")]));
  const member = visibleTeamSectionsForTeam(
    caps({ multiplayer: true, role: "user" }),
    team([agent("a", "user")]),
  );

  it("keeps a section the caller can see", () => {
    assert.equal(resolveTeamSection(admin, "settings"), "settings");
    assert.equal(
      resolveTeamSection(admin, "mission-control"),
      "mission-control",
    );
    assert.equal(resolveTeamSection(admin, "routines"), "routines");
    assert.equal(resolveTeamSection(member, "files"), "files");
  });

  it("falls back to Mission Control for nothing chosen and for a gated section", () => {
    assert.equal(resolveTeamSection(admin, null), "mission-control");
    assert.equal(resolveTeamSection(member, "settings"), "mission-control");
  });
});

describe("sectionHonorsAgentPin", () => {
  it("is true for every section that narrows by the shared agent pin", () => {
    for (const section of ["mission-control", "routines", "files"] as const) {
      assert.equal(sectionHonorsAgentPin(section), true, section);
    }
  });

  it("is false for Team Settings, which lists the whole team regardless", () => {
    // The rail reads this to decide whether to FILL an agent row: a lit row
    // under Settings would claim a narrowing nothing on screen is doing.
    assert.equal(sectionHonorsAgentPin("settings"), false);
  });

  it("is false with no section resolved at all", () => {
    assert.equal(sectionHonorsAgentPin(null), false);
  });
});

describe("blockedTeamView", () => {
  const teams = resolveTeams(
    [agent("a")],
    layout([{ id: "g1", name: "Sales", agentIds: ["a"] }]),
    "Acme",
  );

  it("leaves every other view alone", () => {
    assert.equal(blockedTeamView("dashboard", [], null), false);
    assert.equal(blockedTeamView("settings", [], "g1"), false);
  });

  it("passes a team that still resolves", () => {
    assert.equal(blockedTeamView(TEAM_VIEW_ID, teams, "g1"), false);
    assert.equal(blockedTeamView(TEAM_VIEW_ID, teams, DEFAULT_TEAM_ID), false);
  });

  it("blocks a deleted team, an unset team, and a workspace with no teams", () => {
    assert.equal(blockedTeamView(TEAM_VIEW_ID, teams, "gone"), true);
    assert.equal(blockedTeamView(TEAM_VIEW_ID, teams, null), true);
    assert.equal(blockedTeamView(TEAM_VIEW_ID, [], "g1"), true);
  });

  it("passes a SERVER team the caller has NOT joined", () => {
    // Joining is sidebar PINNING and it grants nothing (C13's first
    // non-negotiable): every team the gateway lists is one this caller may
    // already see. Blocking on `joined` dead-ended every jump to an agent that
    // lives in an unjoined team -- the destination map resolved the right team
    // and this guard threw the user back onto the dashboard.
    const unjoined = [
      team([agent("a")], { id: "s1", server: facts({ joined: false }) }),
    ];
    const joined = [
      team([agent("a")], { id: "s1", server: facts({ joined: true }) }),
    ];
    assert.equal(blockedTeamView(TEAM_VIEW_ID, unjoined, "s1"), false);
    assert.equal(blockedTeamView(TEAM_VIEW_ID, joined, "s1"), false);
  });

  it("still blocks a SERVER team id that resolves to nothing", () => {
    // The ONE thing left to block: a team that is gone. Deleted by its owner,
    // or a stale id from a space the caller switched away from.
    const unjoined = [team([], { id: "s1", server: facts({ joined: false }) })];
    assert.equal(blockedTeamView(TEAM_VIEW_ID, unjoined, "gone"), true);
    assert.equal(blockedTeamView(TEAM_VIEW_ID, [], "s1"), true);
  });

  it("never blocks a non-team viewMode, whatever the teams say", () => {
    const unjoined = [team([], { id: "s1", server: facts({ joined: false }) })];
    for (const view of ["dashboard", "settings", "store"]) {
      assert.equal(blockedTeamView(view, unjoined, "s1"), false, view);
      assert.equal(blockedTeamView(view, [], "gone"), false, view);
    }
  });
});

describe("canRenameTeam / canDeleteTeam / canLeaveTeam / canJoinTeam", () => {
  const local = team([]);
  const localDefault = team([], { id: DEFAULT_TEAM_ID, isDefault: true });
  const srv = (over: Partial<ServerTeamFacts>, isDefault = false) =>
    team([], { id: "s1", isDefault, server: facts(over) });

  it("off the server backend the rules are exactly today's: any group but the default", () => {
    assert.equal(canRenameTeam(local), true);
    assert.equal(canDeleteTeam(local), true);
    assert.equal(canRenameTeam(localDefault), false);
    assert.equal(canDeleteTeam(localDefault), false);
    // There is no membership to join or leave without a server.
    assert.equal(canLeaveTeam(local), false);
    assert.equal(canJoinTeam(local), false);
    assert.equal(canLeaveTeam(localDefault), false);
    assert.equal(canJoinTeam(localDefault), false);
  });

  it("canRenameTeam is the server owner, INCLUDING on the default team", () => {
    // The default team's rail block carries no menu, so Team Settings is the
    // only place its name (the space's own) can be edited.
    assert.equal(canRenameTeam(srv({ owner: true })), true);
    assert.equal(canRenameTeam(srv({ owner: false })), false);
    assert.equal(canRenameTeam(srv({ owner: true }, true)), true);
  });

  it("canDeleteTeam needs the server owner AND a non-default team", () => {
    assert.equal(canDeleteTeam(srv({ owner: true })), true);
    assert.equal(canDeleteTeam(srv({ owner: false })), false);
    assert.equal(canDeleteTeam(srv({ owner: true }, true)), false);
  });

  it("canLeaveTeam needs a joined, non-default server team", () => {
    assert.equal(canLeaveTeam(srv({ joined: true })), true);
    assert.equal(canLeaveTeam(srv({ joined: false })), false);
    assert.equal(canLeaveTeam(srv({ joined: true }, true)), false);
  });

  it("canJoinTeam is offered exactly on the server teams you are not in", () => {
    assert.equal(canJoinTeam(srv({ joined: false })), true);
    assert.equal(canJoinTeam(srv({ joined: true })), false);
  });
});
