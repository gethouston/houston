import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  teamPinnedAgent,
  teamScopedAgents,
  teamSelectedAgent,
} from "../src/components/team-view/team-agent-choice.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * Which of a team's agents a section is looking at. Three shapes over ONE pin,
 * and the rule that matters most is the one that is invisible until it breaks:
 * a pin naming an agent this team no longer holds is DROPPED. Without it a
 * section opens empty (Routines) or on somebody else's tree (Files) with no
 * visible control saying why, because the dropdown that would clear the filter
 * only offers this team's members.
 */

const agent = (id: string, name = id): Agent =>
  ({ id, name, folderPath: `/w/${id}` }) as Agent;

const TEAM = [agent("a", "Ana"), agent("b", "Bo")];

describe("teamPinnedAgent", () => {
  it("resolves a pin that is still a member", () => {
    assert.equal(teamPinnedAgent(TEAM, "b")?.name, "Bo");
  });

  it("is null with no pin at all", () => {
    assert.equal(teamPinnedAgent(TEAM, null), null);
  });

  it("DROPS a pin naming an agent this team does not hold", () => {
    // The agent was dragged into another team while this section was open.
    assert.equal(teamPinnedAgent(TEAM, "gone"), null);
  });

  it("drops every pin on a team with no agents", () => {
    assert.equal(teamPinnedAgent([], "a"), null);
    assert.equal(teamPinnedAgent([], null), null);
  });

  it("matches on the agent ID, never on the name or the folder path", () => {
    // The store pins an id; boards and dropdowns speak folder paths. Confusing
    // the two would light the wrong row the moment two agents share a name.
    assert.equal(teamPinnedAgent(TEAM, "Ana"), null);
    assert.equal(teamPinnedAgent(TEAM, "/w/a"), null);
  });
});

describe("teamScopedAgents", () => {
  it("narrows an aggregating section to the pinned agent", () => {
    assert.deepEqual(
      teamScopedAgents(TEAM, "b").map((a) => a.id),
      ["b"],
    );
  });

  it("spans the whole team with no pin", () => {
    assert.deepEqual(
      teamScopedAgents(TEAM, null).map((a) => a.id),
      ["a", "b"],
    );
  });

  it("spans the whole team when the pin left it, rather than emptying", () => {
    // A section showing nothing, with a dropdown that cannot name the agent it
    // is filtered to, is a dead end.
    assert.deepEqual(
      teamScopedAgents(TEAM, "gone").map((a) => a.id),
      ["a", "b"],
    );
  });

  it("keeps the team's drag order, which every team surface reads in", () => {
    const reversed = [agent("b", "Bo"), agent("a", "Ana")];
    assert.deepEqual(
      teamScopedAgents(reversed, null).map((a) => a.id),
      ["b", "a"],
    );
  });

  it("has nothing to scope on an empty team", () => {
    assert.deepEqual(teamScopedAgents([], null), []);
    assert.deepEqual(teamScopedAgents([], "a"), []);
  });
});

describe("teamSelectedAgent", () => {
  it("opens on the pinned agent when the rail sent one", () => {
    assert.equal(teamSelectedAgent(TEAM, "b")?.id, "b");
  });

  it("falls back to the team's first agent with no pin", () => {
    assert.equal(teamSelectedAgent(TEAM, null)?.id, "a");
  });

  it("falls back to the first agent when the pin left the team", () => {
    // A single-agent section cannot show "all agents", so a dropped pin has to
    // land somewhere real — never on nothing while the team still has members.
    assert.equal(teamSelectedAgent(TEAM, "gone")?.id, "a");
  });

  it("has nothing to open on an empty team", () => {
    assert.equal(teamSelectedAgent([], null), null);
    assert.equal(teamSelectedAgent([], "a"), null);
  });
});
