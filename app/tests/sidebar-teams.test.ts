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

const OWNER_SECTIONS: TeamSectionId[] = [
  "mission-control",
  "routines",
  "files",
  "settings",
];
const MEMBER_SECTIONS: TeamSectionId[] = [
  "mission-control",
  "routines",
  "files",
];

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
    // Same rule with no pin at all.
    assert.equal(
      resolveTeamHighlight({ ...openTeam, teamSection: null }, OWNER_SECTIONS)
        .section,
      "mission-control",
    );
    // A section this caller CAN see is kept, never collapsed to the first one.
    for (const teamSection of ["routines", "files"] as const) {
      assert.equal(
        resolveTeamHighlight({ ...openTeam, teamSection }, OWNER_SECTIONS)
          .section,
        teamSection,
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
      ["mission-control", "routines", "files", "settings"],
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
      [false, false, false, true],
    );
    // Same section id, a different team: never active.
    const other = teamSectionRowModels(team("g2"), OWNER_SECTIONS, highlight);
    assert.deepEqual(
      other.map((r) => r.active),
      [false, false, false, false],
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
      ["mission-control", "routines", "files"],
    );
    assert.deepEqual(
      rows.map((r) => r.active),
      [true, false, false],
    );
  });
});

describe("sidebarSelectedAgentId", () => {
  // The pin only means something under a section that narrows by it, so the
  // baseline highlight is one that does.
  const highlight = resolveTeamHighlight(
    { ...openTeam, teamSection: "mission-control" },
    OWNER_SECTIONS,
  );

  it("selects the team view's agent filter", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: team("g1", ["a1", "a2"]),
      }),
      "a1",
    );
  });

  it("fills the row under every section that narrows by the pin", () => {
    for (const teamSection of [
      "mission-control",
      "routines",
      "files",
    ] as const) {
      assert.equal(
        sidebarSelectedAgentId({
          viewMode: TEAM_VIEW_ID,
          highlight: resolveTeamHighlight(
            { ...openTeam, teamSection },
            OWNER_SECTIONS,
          ),
          activeTeam: team("g1", ["a1", "a2"]),
        }),
        "a1",
        teamSection,
      );
    }
  });

  it("fills NO row under Team Settings, which ignores the pin", () => {
    // Settings lists the whole team whatever the pin says. A lit agent row
    // there would claim a narrowing nothing on screen is doing — and clicking
    // it again would look like a no-op.
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: resolveTeamHighlight(openTeam, OWNER_SECTIONS),
        activeTeam: team("g1", ["a1", "a2"]),
      }),
      null,
    );
    // And the pin is NOT lost: it lights again the moment a section that
    // honors it is opened (the rail carries it across destinations).
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: resolveTeamHighlight(
          { ...openTeam, teamSection: "routines" },
          OWNER_SECTIONS,
        ),
        activeTeam: team("g1", ["a1", "a2"]),
      }),
      "a1",
    );
  });

  it("fills no row for a MEMBER whose Settings pin fell back to the board", () => {
    // The fallback section is Mission Control, which does honor the pin, so
    // the row lights — the gate is on what is ON SCREEN, not on what was asked
    // for.
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: resolveTeamHighlight(openTeam, MEMBER_SECTIONS),
        activeTeam: team("g1", ["a1", "a2"]),
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
      }),
      null,
    );
    // Same for the single frame before the shell's guard resolves a dead team.
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: null,
      }),
      null,
    );
  });

  it("selects nothing on another top-level view", () => {
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: "dashboard",
        highlight: { teamId: null, section: null, agentId: null },
        activeTeam: null,
      }),
      null,
    );
  });
});
