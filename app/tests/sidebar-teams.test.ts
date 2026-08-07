import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveTeamHighlight,
  sidebarSelectedAgentId,
  teamSectionRowModels,
} from "../src/lib/sidebar-teams.ts";
import type { TeamSectionId, TeamView } from "../src/lib/teams-model.ts";
import { DEFAULT_TEAM_ID, TEAM_VIEW_ID } from "../src/lib/teams-model.ts";

const team = (id: string, agentIds: string[] = []): TeamView => ({
  id,
  name: id,
  agents: agentIds.map((agentId) => ({
    id: agentId,
    name: agentId,
    folderPath: agentId,
  })) as TeamView["agents"],
  isDefault: id === DEFAULT_TEAM_ID,
});

const OWNER_SECTIONS: TeamSectionId[] = ["mission-control", "settings"];
const MEMBER_SECTIONS: TeamSectionId[] = ["mission-control"];

const openTeam = {
  viewMode: TEAM_VIEW_ID,
  activeTeamId: "g1",
  teamSection: "settings" as const,
  teamAgentFilter: "a1",
};

describe("resolveTeamHighlight", () => {
  it("reads the open team, section and agent filter off a team view", () => {
    assert.deepEqual(resolveTeamHighlight(openTeam, OWNER_SECTIONS), {
      teamId: "g1",
      section: "settings",
      agentId: "a1",
    });
  });

  it("highlights nothing while another view is open, however stale the pins", () => {
    // The team pointers survive a navigation away; lighting a row off them
    // would claim the user is somewhere they are not.
    for (const viewMode of ["chat", "dashboard", "settings", "ai-hub"]) {
      assert.deepEqual(
        resolveTeamHighlight({ ...openTeam, viewMode }, OWNER_SECTIONS),
        { teamId: null, section: null, agentId: null },
        viewMode,
      );
    }
  });

  it("highlights the section the view actually falls back to", () => {
    // A member whose store still pins Team Settings (a space switch demoted
    // them with the view open) sees Mission Control on screen, so Mission
    // Control is the row that must be lit — not nothing.
    assert.equal(
      resolveTeamHighlight(openTeam, MEMBER_SECTIONS).section,
      "mission-control",
    );
    // Same rule for sections that have no surface yet, and for no pin at all.
    for (const teamSection of ["routines", "files", null] as const) {
      assert.equal(
        resolveTeamHighlight({ ...openTeam, teamSection }, OWNER_SECTIONS)
          .section,
        "mission-control",
        String(teamSection),
      );
    }
  });
});

describe("teamSectionRowModels", () => {
  it("emits one row per visible section, in the given order", () => {
    const rows = teamSectionRowModels(
      team("g1"),
      OWNER_SECTIONS,
      resolveTeamHighlight(openTeam, OWNER_SECTIONS),
    );
    assert.deepEqual(
      rows.map((r) => r.section),
      ["mission-control", "settings"],
    );
    assert.equal(
      rows.every((r) => r.teamId === "g1"),
      true,
    );
  });

  it("marks only the open team's open section active", () => {
    const highlight = resolveTeamHighlight(openTeam, OWNER_SECTIONS);
    const own = teamSectionRowModels(team("g1"), OWNER_SECTIONS, highlight);
    assert.deepEqual(
      own.map((r) => r.active),
      [false, true],
    );
    // Same section id, a different team: never active.
    const other = teamSectionRowModels(team("g2"), OWNER_SECTIONS, highlight);
    assert.deepEqual(
      other.map((r) => r.active),
      [false, false],
    );
  });

  it("gives a caller with no Team Settings no settings row, and lights the one it has", () => {
    const rows = teamSectionRowModels(
      team("g1"),
      MEMBER_SECTIONS,
      // Stale "settings" pin + no settings section: the rail must agree with
      // the view, which falls back to Mission Control.
      resolveTeamHighlight(openTeam, MEMBER_SECTIONS),
    );
    assert.deepEqual(
      rows.map((r) => r.section),
      ["mission-control"],
    );
    assert.deepEqual(
      rows.map((r) => r.active),
      [true],
    );
  });
});

describe("sidebarSelectedAgentId", () => {
  const highlight = resolveTeamHighlight(openTeam, OWNER_SECTIONS);

  it("selects the team view's agent filter, not the store's current agent", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: team("g1", ["a1", "a2"]),
        currentAgentId: "a9",
      }),
      "a1",
    );
  });

  it("selects nothing when a team view is open with no agent filter", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: { teamId: "g1", section: "mission-control", agentId: null },
        activeTeam: team("g1", ["a1"]),
        currentAgentId: "a9",
      }),
      null,
    );
  });

  it("drops the fill when the filtered agent left the open team", () => {
    // The board clears a filter pointing outside its scope, so a row still lit
    // would name a filter no board is applying.
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: team("g1", ["a2"]),
        currentAgentId: "a9",
      }),
      null,
    );
    // Same for the single frame before the shell's guard resolves a dead team.
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: null,
        currentAgentId: "a9",
      }),
      null,
    );
  });

  it("selects the open agent on an agent tab", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: "chat",
        highlight: { teamId: null, section: null, agentId: null },
        activeTeam: null,
        currentAgentId: "a9",
      }),
      "a9",
    );
  });

  it("selects nothing on another top-level view", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: "dashboard",
        highlight: { teamId: null, section: null, agentId: null },
        activeTeam: null,
        currentAgentId: "a9",
      }),
      null,
    );
  });
});
