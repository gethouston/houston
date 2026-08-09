import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEAM_HOME_SECTION } from "../src/lib/team-header-click.ts";
import {
  type TeamHomeLozengeInput,
  teamHomeLozengeActive,
  teamHomeLozengeClick,
} from "../src/lib/team-home-lozenge.ts";
import type { TeamSectionId } from "../src/lib/teams-model.ts";

/**
 * The team strip's first lozenge is the team AND the board. One control, three
 * answers — the same grammar the rail's team header speaks, on the other
 * surface. Each arm is invisible from the others, so each is pinned, and the
 * whole input space is swept to prove they cannot overlap.
 */

const SECTIONS: (TeamSectionId | null)[] = [
  "mission-control",
  "routines",
  "files",
  "archived",
  "settings",
  null,
];

describe("teamHomeLozengeClick", () => {
  it("opens the board from anywhere else in the team", () => {
    for (const section of SECTIONS) {
      if (section === TEAM_HOME_SECTION) continue;
      assert.deepEqual(
        teamHomeLozengeClick({ section, pinnedAgentId: null }),
        { kind: "open" },
        `${section}`,
      );
      // Pinned or not: leaving another section for the board is one act, and
      // the pin rides along rather than being cleared on the way.
      assert.deepEqual(
        teamHomeLozengeClick({ section, pinnedAgentId: "kai" }),
        { kind: "open" },
        `${section} + pin`,
      );
    }
  });

  it("clears the pin when the board is already up and narrowed", () => {
    assert.deepEqual(
      teamHomeLozengeClick({
        section: "mission-control",
        pinnedAgentId: "kai",
      }),
      { kind: "clear-pin" },
    );
  });

  it("does nothing on the whole team's own board", () => {
    // Explicit, not a fall-through: "the click did nothing" has to be a
    // decision the caller can see.
    assert.deepEqual(
      teamHomeLozengeClick({ section: "mission-control", pinnedAgentId: null }),
      { kind: "none" },
    );
  });

  it("reads a null section as somewhere else, never as the board", () => {
    assert.deepEqual(
      teamHomeLozengeClick({ section: null, pinnedAgentId: null }),
      {
        kind: "open",
      },
    );
  });

  it("answers exactly ONE arm for every input in the space", () => {
    const kinds = new Set<string>();
    for (const section of SECTIONS) {
      for (const pinnedAgentId of [null, "kai"]) {
        const input: TeamHomeLozengeInput = { section, pinnedAgentId };
        const answer = teamHomeLozengeClick(input);
        // Total: every input gets an answer, and it is one of the three.
        assert.ok(
          ["open", "clear-pin", "none"].includes(answer.kind),
          `${section}/${pinnedAgentId}`,
        );
        kinds.add(answer.kind);
        // Disjoint: the same input asked twice cannot answer differently, and
        // the answer carries nothing but its kind.
        assert.deepEqual(teamHomeLozengeClick(input), answer);
        assert.deepEqual(Object.keys(answer), ["kind"]);
      }
    }
    // All three arms are actually reachable — an arm nothing can reach is a
    // rule that does not exist.
    assert.deepEqual([...kinds].sort(), ["clear-pin", "none", "open"]);
  });
});

describe("teamHomeLozengeActive", () => {
  it("lights only on the board", () => {
    assert.equal(teamHomeLozengeActive("mission-control"), true);
    for (const section of SECTIONS) {
      if (section === TEAM_HOME_SECTION) continue;
      assert.equal(teamHomeLozengeActive(section), false, `${section}`);
    }
  });
});
