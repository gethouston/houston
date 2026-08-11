import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities, SidebarLayout } from "@houston-ai/engine-client";
import {
  blockedTeamView,
  canConfigureTeam,
  canConfigureTeamsByRole,
  canDeleteTeam,
  canLeaveTeam,
  canRenameTeam,
  DEFAULT_TEAM_ID,
  homeTeam,
  resolveTeamSection,
  resolveTeams,
  type ServerTeamFacts,
  sectionHonorsAgentPin,
  TEAM_VIEW_ID,
  type TeamView,
  teamById,
  teamDeletePresentation,
  teamDisplayName,
  teamOfAgent,
  teamPeopleFace,
  visibleAgentSections,
  visibleTeamSectionsForTeam,
  visibleTeamSettingsSections,
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
      usesDefaultIdentity: true,
    });
    assert.deepEqual(resolveTeams([], layout([]), "Solo")[0]?.agents, []);
  });

  it("marks the local default for a localized display name without replacing its real name", () => {
    const team = resolveTeams([], layout([]), "Acme")[0];
    assert.equal(team?.name, "Acme");
    assert.equal(team && teamDisplayName(team, "New Team"), "New Team");
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

  it("copies a named group's icon and color onto its team", () => {
    // Identity lives on BOTH backends: locally it is stored on the group.
    const teams = resolveTeams(
      [agent("a")],
      layout([
        {
          id: "g1",
          name: "Sales",
          agentIds: ["a"],
          icon: "rocket",
          color: "#5E6AD2",
        },
      ]),
      "Acme",
    );
    assert.equal(teams[0]?.icon, "rocket");
    assert.equal(teams[0]?.color, "#5E6AD2");
  });

  it("leaves an unset icon or color ABSENT, and gives the default team neither", () => {
    // Absent means "draw the rail's own default". The VIRTUAL default team owns
    // no stored group row to hold either one, exactly as it owns no `collapsed`.
    const teams = resolveTeams(
      [agent("a")],
      layout([{ id: "g1", name: "Sales", agentIds: [], icon: "book" }], ["a"]),
      "Acme",
    );
    assert.equal("color" in (teams[0] as TeamView), false);
    assert.equal("icon" in (teams[1] as TeamView), false);
    assert.equal("color" in (teams[1] as TeamView), false);
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

  it("homeTeam is the FIRST team in rail order", () => {
    // Home is the top of the user's own sidebar. There is no global board to
    // land on any more, so this single pick is where the app opens and where
    // every fallback lands.
    const teams = resolveTeams(
      [agent("a")],
      layout([
        { id: "g1", name: "One", agentIds: ["a"] },
        { id: "g2", name: "Two", agentIds: [] },
      ]),
      "Acme",
    );
    assert.equal(homeTeam(teams)?.id, "g1");
  });

  it("homeTeam answers null while no team has resolved", () => {
    // The in-flight window of a server-teams read, and a caller with no
    // workspace. The callers answer it with the Inbox, never with a guess.
    assert.equal(homeTeam([]), null);
  });
});

describe("teamDeletePresentation", () => {
  const local = (isDefault = false): TeamView => ({
    id: isDefault ? DEFAULT_TEAM_ID : "team-1",
    name: "Team",
    agents: [],
    isDefault,
  });

  it("keeps Delete visible but disabled for the only team", () => {
    const team = local(true);
    assert.equal(teamDeletePresentation([team], team), "disabled-only-team");
  });

  it("enables an allowed team and hides a disallowed team when siblings exist", () => {
    const deletable = local();
    const defaultTeam = local(true);
    assert.equal(
      teamDeletePresentation([deletable, defaultTeam], deletable),
      "enabled",
    );
    assert.equal(
      teamDeletePresentation([deletable, defaultTeam], defaultTeam),
      "hidden",
    );
  });
});

describe("canConfigureTeamsByRole", () => {
  it("single-player always sees Team Settings", () => {
    assert.equal(canConfigureTeamsByRole(null), true);
    assert.equal(canConfigureTeamsByRole(caps({})), true);
  });

  it("multiplayer gates on owner/admin and denies plain members", () => {
    assert.equal(
      canConfigureTeamsByRole(caps({ multiplayer: true, role: "owner" })),
      true,
    );
    assert.equal(
      canConfigureTeamsByRole(caps({ multiplayer: true, role: "admin" })),
      true,
    );
    assert.equal(
      canConfigureTeamsByRole(caps({ multiplayer: true, role: "user" })),
      false,
    );
    assert.equal(canConfigureTeamsByRole(caps({ multiplayer: true })), false);
  });
});

describe("visibleTeamSectionsForTeam", () => {
  const WORK = ["mission-control", "routines", "files"] as const;
  const MANAGER = [...WORK, "settings"] as const;
  const MEMBER = caps({ multiplayer: true, role: "user" });

  it("gives a plain member exactly the three work sections", () => {
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        MEMBER,
        team([agent("a", "user")], { server: facts(), context: "" }),
      ),
      [...WORK],
    );
  });

  it("an agent manager gets every applicable manager section", () => {
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        MEMBER,
        team([agent("a", "manager")], { server: facts(), context: "" }),
      ),
      [...MANAGER],
    );
  });

  it("keeps configuration behind one manager door for every people face", () => {
    const managedTeam = team([agent("a", "manager")], {
      server: facts(),
      context: "",
    });
    assert.deepEqual(
      visibleTeamSectionsForTeam(MEMBER, managedTeam, "roster"),
      [...MANAGER],
    );
    assert.deepEqual(
      visibleTeamSectionsForTeam(MEMBER, managedTeam, "hidden"),
      [...MANAGER],
    );
  });

  it("keeps the same manager section in a personal space", () => {
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        MEMBER,
        team([], { server: facts({ owner: true }), context: "" }),
      ),
      [...MANAGER],
    );
  });

  it("local backend gets the manager section", () => {
    assert.deepEqual(visibleTeamSectionsForTeam(null, team([agent("a")])), [
      ...MANAGER,
    ]);
  });

  it("keeps the settings door when a server team does not serve context", () => {
    assert.deepEqual(
      visibleTeamSectionsForTeam(
        MEMBER,
        team([], { server: facts({ owner: true }) }),
      ),
      [...MANAGER],
    );
  });

  it("builds the drilled set and keeps People for invite faces", () => {
    assert.deepEqual(visibleTeamSettingsSections(team([]), "hidden"), [
      "context",
      "agents",
      "people",
      "settings",
    ]);
    assert.deepEqual(
      visibleTeamSettingsSections(team([], { server: facts() }), "invite"),
      ["context", "agents", "people", "settings"],
    );
  });
});

describe("visibleAgentSections", () => {
  const WORK = ["mission-control", "routines", "files"] as const;

  it("adds settings only for this agent's manager", () => {
    const member = caps({ multiplayer: true, role: "user" });
    assert.deepEqual(visibleAgentSections(member, agent("a", "user")), [
      ...WORK,
    ]);
    assert.deepEqual(visibleAgentSections(member, agent("a", "manager")), [
      ...WORK,
      "settings",
    ]);
  });
});

describe("teamPeopleFace", () => {
  it("covers roster, invite, and hidden deployments", () => {
    assert.equal(
      teamPeopleFace(team([], { server: facts() }), false, true),
      "roster",
    );
    assert.equal(teamPeopleFace(team([]), true, true), "invite");
    assert.equal(teamPeopleFace(team([]), false, false), "hidden");
    assert.equal(
      teamPeopleFace(team([], { server: facts() }), true, true),
      "invite",
    );
  });
});

describe("canConfigureTeam", () => {
  const MEMBER = caps({ multiplayer: true, role: "user" });

  it("allows a server team owner", () => {
    assert.equal(
      canConfigureTeam(MEMBER, team([], { server: facts({ owner: true }) })),
      true,
    );
  });

  it("allows a manager of one of the team's agents", () => {
    assert.equal(canConfigureTeam(MEMBER, team([agent("a", "manager")])), true);
  });

  it("denies a plain member", () => {
    assert.equal(canConfigureTeam(MEMBER, team([agent("a", "user")])), false);
  });

  it("allows a local-backend org admin", () => {
    assert.equal(
      canConfigureTeam(caps({ multiplayer: true, role: "admin" }), team([])),
      true,
    );
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
  it("is true for the BOARD, and only the board", () => {
    // The pin is what the rail SETS by clicking an agent, and the board is the
    // one surface that shows what that click means.
    assert.equal(sectionHonorsAgentPin("mission-control"), true);
  });

  it("is false for every other section, each for its own reason", () => {
    // Two surfaces read this to decide whether to CLAIM a narrowing — the rail
    // fills an agent row, the team's lozenge grows its second segment. On any
    // of these, both would assert something nothing on screen is doing.
    //  - focused agent screens the whole team whatever the pin says;
    //  - Files resolves its OWN agent (falling back to the team's first, never
    //    writing back);
    //  - Routines and Archived carry a SECTION-LOCAL filter instead, so a tab
    //    click opens them team-wide and narrowing one narrows nothing else.
    for (const section of ["routines", "files", "settings"] as const) {
      assert.equal(sectionHonorsAgentPin(section), false, section);
    }
  });

  it("is false with no section resolved at all", () => {
    assert.equal(sectionHonorsAgentPin(null), false);
  });

  it("does not mean the pin is FORGOTTEN off the board", () => {
    // The rule governs what a surface may CLAIM, never what the store holds:
    // opening Routines and coming back finds the board still pinned. Nothing
    // here writes, which is the whole guarantee.
    assert.equal(sectionHonorsAgentPin("routines"), false);
    assert.equal(sectionHonorsAgentPin("mission-control"), true);
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

describe("canRenameTeam / canDeleteTeam / canLeaveTeam", () => {
  const local = team([]);
  const localDefault = team([], { id: DEFAULT_TEAM_ID, isDefault: true });
  const srv = (over: Partial<ServerTeamFacts>, isDefault = false) =>
    team([], { id: "s1", isDefault, server: facts(over) });

  it("off the server backend the rules are exactly today's: any group but the default", () => {
    assert.equal(canRenameTeam(local), true);
    assert.equal(canDeleteTeam(local), true);
    assert.equal(canRenameTeam(localDefault), false);
    assert.equal(canDeleteTeam(localDefault), false);
    // There is no membership to leave without a server.
    assert.equal(canLeaveTeam(local, false), false);
    assert.equal(canLeaveTeam(localDefault, false), false);
  });

  it("canRenameTeam is the server owner, INCLUDING on the default team", () => {
    // Two doors read this one gate: Team Settings' name field, and the default
    // block's own rail menu, whose single entry is this rename.
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
    assert.equal(canLeaveTeam(srv({ joined: true }), false), true);
    assert.equal(canLeaveTeam(srv({ joined: false }), false), false);
    assert.equal(canLeaveTeam(srv({ joined: true }, true), false), false);
  });

  it("canLeaveTeam is NEVER offered in a personal space", () => {
    // The one human there created every team and holds an owner row nothing can
    // remove, so `joined` is true forever and the joined test alone would offer
    // Leave on all of them — straight onto a `403 personal_space`.
    assert.equal(canLeaveTeam(srv({ joined: true }), true), false);
    assert.equal(canLeaveTeam(srv({ joined: true, owner: true }), true), false);
    assert.equal(canLeaveTeam(srv({ joined: true }, true), true), false);
  });
});
