import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localMoveDest,
  moveTargetTeams,
} from "../src/components/team-view/move-agent-model.ts";
import { DEFAULT_TEAM_ID, type TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * "Move to team" — the explicit action that replaced cross-team drag. Two pure
 * rules stand behind it, and both fail silently when wrong: an picker that
 * offers the team the agent is already in makes a no-op look like a move, and a
 * local move keyed by the DEFAULT_TEAM_ID sentinel writes to a group nothing
 * renders, so the agent leaves the rail entirely.
 */

const agent = (id: string): Agent => ({ id, name: id }) as Agent;

const team = (id: string, over: Partial<TeamView> = {}): TeamView => ({
  id,
  name: id,
  agents: [agent("a")],
  isDefault: false,
  ...over,
});

const DEFAULT_TEAM = team(DEFAULT_TEAM_ID, {
  name: "Acme",
  isDefault: true,
});

describe("moveTargetTeams", () => {
  it("offers every OTHER team, in rail order", () => {
    const teams = [team("t1"), team("t2"), DEFAULT_TEAM];
    assert.deepEqual(
      moveTargetTeams(teams, "t2").map((t) => t.id),
      ["t1", DEFAULT_TEAM_ID],
    );
  });

  it("never offers the team the agent is already in", () => {
    const teams = [team("t1"), team("t2")];
    assert.equal(
      moveTargetTeams(teams, "t1").some((t) => t.id === "t1"),
      false,
    );
  });

  it("is empty in a workspace with one team, so no action is drawn", () => {
    assert.deepEqual(moveTargetTeams([DEFAULT_TEAM], DEFAULT_TEAM_ID), []);
  });

  it("is unchanged by a current-team id no team holds", () => {
    const teams = [team("t1"), team("t2")];
    assert.equal(moveTargetTeams(teams, "gone").length, 2);
  });
});

describe("localMoveDest", () => {
  it("sends a named team's move to that group, appended", () => {
    assert.deepEqual(localMoveDest(team("t1")), {
      groupId: "t1",
      beforeItemId: null,
    });
  });

  it("sends the DEFAULT team's move to the layout's null section", () => {
    // The virtual default team owns no stored group row. Keyed by its sentinel
    // the write would mint a group nothing draws.
    assert.deepEqual(localMoveDest(DEFAULT_TEAM), {
      groupId: null,
      beforeItemId: null,
    });
  });
});
