import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TEAM_HOME_SECTION,
  type TeamHeaderClickInput,
  teamHeaderClick,
} from "../src/lib/team-header-click.ts";
import type { TeamSectionId } from "../src/lib/teams-model.ts";

/**
 * The five arms of the rail's one hit target. A team block is a header row and
 * its agents, so this function IS the rail's navigation contract: get an arm
 * wrong and clicking a team either refuses to go anywhere, folds the block out
 * from under the cursor, or swallows a pin the user still wanted.
 *
 * (An agent row needs no rule of its own: it always opens its team's Tasks with
 * itself pinned.)
 */

const click = (over: Partial<TeamHeaderClickInput> = {}) =>
  teamHeaderClick({
    teamId: "g1",
    collapsed: false,
    activeTeamId: "g1",
    section: TEAM_HOME_SECTION,
    agentPinned: false,
    ...over,
  }).kind;

const SECTIONS: (TeamSectionId | null)[] = [
  "mission-control",
  "routines",
  "files",
  "settings",
  null,
];

describe("teamHeaderClick", () => {
  it("1. NOT in this team: opens its Tasks and folds every other team", () => {
    assert.equal(click({ activeTeamId: "g2" }), "open-solo");
    // Neither the fold nor the pin enters into it: wherever the block was, it
    // ends open and showing everything.
    assert.equal(click({ activeTeamId: "g2", collapsed: true }), "open-solo");
    assert.equal(click({ activeTeamId: "g2", agentPinned: true }), "open-solo");
    // Off a team view entirely (`resolveTeamHighlight` nulls both fields).
    assert.equal(click({ activeTeamId: null, section: null }), "open-solo");
  });

  it("2. in this team on ANOTHER section: opens Tasks, folds nothing", () => {
    for (const section of ["routines", "files", "settings"] as const) {
      assert.equal(click({ section }), "open", section);
      // Still just a navigation when the block happens to be folded, or when a
      // pin is riding along: the user asked for the board.
      assert.equal(click({ section, collapsed: true }), "open", section);
      assert.equal(click({ section, agentPinned: true }), "open", section);
    }
  });

  it("3. on this team's Tasks, FOLDED: unfolds the block, pin or no pin", () => {
    // The fold is asked BEFORE the pin: a folded block draws no agent rows, so
    // there is no filtered row on screen to widen away from, and the one thing
    // a user can want from a folded block is to see inside it.
    assert.equal(click({ collapsed: true }), "expand");
    assert.equal(click({ collapsed: true, agentPinned: true }), "expand");
  });

  it("4. on this team's Tasks, open and NARROWED to an agent: clears the pin", () => {
    // The team's name IS its "all agents" row. Clicking it from a filtered
    // board widens back to the whole team — it must beat the fold, or the click
    // would hide the pinned row while the board stayed filtered by it.
    assert.equal(click({ agentPinned: true }), "clear-pin");
  });

  it("5. on this team's Tasks, open and UNFILTERED: folds the block", () => {
    // The rail folds and the SCREEN STAYS — deliberate, and user-invoked. The
    // header keeps its active pill and picks up its rollup badge, so a folded
    // block still says where the user is.
    assert.equal(click(), "collapse");
  });

  it("treats an unnamed section as 'somewhere else', never as Tasks", () => {
    // Navigating somewhere real beats folding a block over a screen we could
    // not name.
    assert.equal(click({ section: null }), "open");
  });

  it("asks the five questions in order, so no input hits two arms", () => {
    // Every combination lands on exactly one arm, and all five are reachable —
    // the switch in the caller is exhaustive over these and nothing else.
    const seen = new Set<string>();
    for (const activeTeamId of ["g1", "g2", null]) {
      for (const section of SECTIONS) {
        for (const collapsed of [true, false]) {
          for (const agentPinned of [true, false]) {
            seen.add(click({ activeTeamId, section, collapsed, agentPinned }));
          }
        }
      }
    }
    assert.deepEqual([...seen].sort(), [
      "clear-pin",
      "collapse",
      "expand",
      "open",
      "open-solo",
    ]);
  });
});
