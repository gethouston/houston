import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveTeamHighlight,
  sidebarSelectedAgentId,
  teamRowActive,
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
  "archived",
  "settings",
];
const MEMBER_SECTIONS: TeamSectionId[] = [
  "mission-control",
  "routines",
  "files",
  "archived",
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
    for (const teamSection of ["routines", "files", "archived"] as const) {
      assert.equal(
        resolveTeamHighlight({ ...openTeam, teamSection }, OWNER_SECTIONS)
          .section,
        teamSection,
      );
    }
  });
});

describe("teamRowActive", () => {
  const highlight = resolveTeamHighlight(openTeam, OWNER_SECTIONS);

  it("lights the open team's row when nothing narrower is on screen", () => {
    // A block carries no destination rows any more, so its header is the row
    // that answers "where am I" for the team. Gating it on the fold, as it was
    // when a section row could speak for the block, made the rail go mute the
    // moment someone opened a team they were already looking at.
    assert.equal(
      teamRowActive({ teamId: "g1", highlight, agentRowLit: false }),
      true,
    );
  });

  it("STEPS ASIDE for a lit agent row: exactly one fill per block", () => {
    // Narrowed to one agent, that agent's row is the more precise answer. Two
    // fills in one block claim the user is in two places at once, which is
    // worse than one answer that is merely coarse.
    assert.equal(
      teamRowActive({ teamId: "g1", highlight, agentRowLit: true }),
      false,
    );
  });

  it("lights the row whichever section of that team is open behind it", () => {
    for (const teamSection of [
      "mission-control",
      "routines",
      "files",
      "settings",
    ] as const) {
      assert.equal(
        teamRowActive({
          teamId: "g1",
          highlight: resolveTeamHighlight(
            { ...openTeam, teamSection },
            OWNER_SECTIONS,
          ),
          agentRowLit: false,
        }),
        true,
        teamSection,
      );
    }
  });

  it("leaves every OTHER team unlit", () => {
    assert.equal(
      teamRowActive({ teamId: "g2", highlight, agentRowLit: false }),
      false,
    );
  });

  it("leaves every team unlit off a team view", () => {
    // No team view open: the pointers are stale and resolveTeamHighlight says
    // so. A lit header over a dashboard would claim the wrong screen.
    const none = resolveTeamHighlight(
      { ...openTeam, viewMode: "dashboard" },
      OWNER_SECTIONS,
    );
    assert.deepEqual(none, { teamId: null, section: null, agentId: null });
    for (const teamId of ["g1", "g2"]) {
      assert.equal(
        teamRowActive({ teamId, highlight: none, agentRowLit: false }),
        false,
        teamId,
      );
    }
  });

  it("leaves the row unlit when no section resolved, there is no screen to name", () => {
    // The frame before blockedTeamView sends a dead team's viewer away.
    assert.equal(
      teamRowActive({
        teamId: "g1",
        highlight: { teamId: "g1", section: null, agentId: "a1" },
        agentRowLit: false,
      }),
      false,
    );
  });
});

describe("the rail fills exactly ONE row", () => {
  // The two halves composed the way the sidebar composes them: the agent answer
  // is resolved first, and the header is handed it. Whatever the pair is asked,
  // at most one of them may light.
  const team = (id: string, agentIds: string[]) =>
    ({
      id,
      name: id,
      agents: agentIds.map((agentId) => ({
        id: agentId,
        name: agentId,
        folderPath: agentId,
      })),
      isDefault: false,
    }) as TeamView;

  for (const teamSection of [
    "mission-control",
    "routines",
    "files",
    "settings",
  ] as const) {
    for (const teamAgentFilter of ["a1", "gone", null]) {
      for (const collapsed of [true, false]) {
        it(`never lights both — ${teamSection}, pin ${teamAgentFilter}, collapsed ${collapsed}`, () => {
          const activeTeam = team("g1", ["a1", "a2"]);
          const highlight = resolveTeamHighlight(
            { ...openTeam, teamSection, teamAgentFilter },
            OWNER_SECTIONS,
          );
          const agentId = sidebarSelectedAgentId({
            viewMode: TEAM_VIEW_ID,
            highlight,
            activeTeam,
            collapsed,
          });
          const headerLit = teamRowActive({
            teamId: "g1",
            highlight,
            agentRowLit: agentId !== null,
          });
          assert.equal(
            [agentId !== null, headerLit].filter(Boolean).length,
            1,
            "exactly one row must be filled",
          );
        });
      }
    }
  }
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

  it("fills the row under the BOARD, the one section the pin narrows", () => {
    for (const teamSection of ["mission-control"] as const) {
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

  it("fills NO row under any section that does not narrow by the pin", () => {
    // Settings lists the whole team whatever the pin says; Files resolves its
    // OWN agent; Routines and Archived carry a section-local filter of their
    // own. A lit agent row under any of them would claim a narrowing nothing
    // on screen is doing — and clicking it again would look like a no-op.
    for (const teamSection of ["files", "routines", "archived"] as const) {
      assert.equal(
        sidebarSelectedAgentId({
          viewMode: TEAM_VIEW_ID,
          highlight: resolveTeamHighlight(
            { ...openTeam, teamSection },
            OWNER_SECTIONS,
          ),
          activeTeam: team("g1", ["a1", "a2"]),
        }),
        null,
        teamSection,
      );
    }
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: resolveTeamHighlight(openTeam, OWNER_SECTIONS),
        activeTeam: team("g1", ["a1", "a2"]),
      }),
      null,
    );
    // And the pin is NOT lost: it lights again the moment the board is back on
    // screen (the rail carries it across destinations).
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight: resolveTeamHighlight(
          { ...openTeam, teamSection: "mission-control" },
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

  it("fills no row when the open team is COLLAPSED, its agents are not drawn", () => {
    // Collapsing hides the agent rows too, so a pinned id would name a row
    // that is not on screen. The header carries the state instead
    // (`teamRowActive`).
    assert.equal(
      sidebarSelectedAgentId({
        viewMode: TEAM_VIEW_ID,
        highlight,
        activeTeam: team("g1", ["a1", "a2"]),
        collapsed: true,
      }),
      null,
    );
  });

  it("keeps filling the row when the open team is expanded, however the flag is passed", () => {
    // Explicit `false` and an omitted flag are the same expanded rail, which
    // is what keeps the argument additive for callers that never collapse.
    for (const collapsed of [false, undefined]) {
      assert.equal(
        sidebarSelectedAgentId({
          viewMode: TEAM_VIEW_ID,
          highlight,
          activeTeam: team("g1", ["a1", "a2"]),
          collapsed,
        }),
        "a1",
        String(collapsed),
      );
    }
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
