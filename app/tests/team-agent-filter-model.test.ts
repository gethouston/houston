import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sectionFilterAgent,
  teamFilterAgentId,
  teamFilterPath,
} from "../src/components/team-view/team-agent-filter-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agents = [
  { id: "a1", folderPath: "Sales/Ana" },
  { id: "a2", folderPath: "Sales/Beto" },
] as Agent[];

describe("teamFilterPath", () => {
  it("maps the pinned agent id to the folder path the board filters on", () => {
    assert.equal(teamFilterPath(agents, "a2"), "Sales/Beto");
  });

  it("means every agent when nothing is pinned", () => {
    assert.equal(teamFilterPath(agents, null), "");
  });

  it("means every agent when the pinned agent left the team", () => {
    assert.equal(teamFilterPath(agents, "a9"), "");
    assert.equal(teamFilterPath([], "a1"), "");
  });
});

describe("teamFilterAgentId", () => {
  it("maps a folder path picked in the board menu back to an agent id", () => {
    assert.equal(teamFilterAgentId(agents, "Sales/Ana"), "a1");
  });

  it("clears the pin for the all-agents choice and for an unknown path", () => {
    assert.equal(teamFilterAgentId(agents, null), null);
    assert.equal(teamFilterAgentId(agents, ""), null);
    assert.equal(teamFilterAgentId(agents, "Other/Zoe"), null);
  });

  it("round-trips every agent of the team", () => {
    for (const a of agents) {
      assert.equal(
        teamFilterAgentId(agents, teamFilterPath(agents, a.id)),
        a.id,
      );
    }
  });
});

/**
 * The SECTION-LOCAL filter's resolution — Routines' and the archive's own "All
 * agents" capsule. Its state is a plain `useState` per section mount, never
 * the team-wide pin, so a tab click always opens the section team-wide; this
 * is the one rule that has to be pure, because a stale id is invisible until
 * a roster changes under an open section.
 */
describe("sectionFilterAgent", () => {
  it("resolves a choice that is still a member", () => {
    assert.equal(sectionFilterAgent(agents, "a2")?.folderPath, "Sales/Beto");
  });

  it("means the whole team when nothing is chosen", () => {
    assert.equal(sectionFilterAgent(agents, null), null);
    assert.equal(sectionFilterAgent(agents, ""), null);
  });

  it("DROPS a choice naming an agent the team no longer holds", () => {
    // The roster can change while a section sits open — someone moves an agent
    // out, a share is revoked. A filter still naming them would empty the list
    // under a control claiming to show them, and the name would not be in the
    // menu to pick again.
    assert.equal(sectionFilterAgent(agents, "gone"), null);
  });

  it("drops every choice on a team with no agents", () => {
    assert.equal(sectionFilterAgent([], "a1"), null);
    assert.equal(sectionFilterAgent([], null), null);
  });
});
