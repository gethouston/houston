import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  teamPinnedAgent,
  teamScopedAgents,
} from "../src/components/team-view/team-agent-choice.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * Which of a team's agents an aggregating section is looking at over ONE pin,
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
