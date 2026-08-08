import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Capabilities, SidebarLayout } from "@houston-ai/engine-client";
import {
  blockedTeamView,
  canSeeTeamSettings,
  DEFAULT_TEAM_ID,
  resolveTeamSection,
  resolveTeams,
  sectionHonorsAgentPin,
  TEAM_VIEW_ID,
  teamById,
  teamOfAgent,
  visibleTeamSections,
} from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string): Agent => ({ id, name: id }) as Agent;

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

describe("visibleTeamSections", () => {
  it("offers the team's work to everyone and Team Settings only to admins", () => {
    assert.deepEqual(visibleTeamSections(null), [
      "mission-control",
      "routines",
      "files",
      "settings",
    ]);
    assert.deepEqual(
      visibleTeamSections(caps({ multiplayer: true, role: "admin" })),
      ["mission-control", "routines", "files", "settings"],
    );
    assert.deepEqual(
      visibleTeamSections(caps({ multiplayer: true, role: "user" })),
      ["mission-control", "routines", "files"],
    );
  });

  it("gives a plain member Routines and Files, and only withholds Team Settings", () => {
    const member = visibleTeamSections(
      caps({ multiplayer: true, role: "user" }),
    );
    assert.equal(member.includes("routines"), true);
    assert.equal(member.includes("files"), true);
    assert.equal(member.includes("settings"), false);
  });
});

describe("resolveTeamSection", () => {
  const admin = visibleTeamSections(null);
  const member = visibleTeamSections(caps({ multiplayer: true, role: "user" }));

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
});
