import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moveTargetTeams } from "../src/components/team-view/move-agent-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string): Agent => ({ id, name: id }) as Agent;
const team = (id: string): TeamView => ({ id, name: id, agents: [agent("a")] });

describe("moveTargetTeams", () => {
  it("offers folders in rail order followed by No team", () => {
    const teams = [team("t1"), team("t2")];
    assert.deepEqual(moveTargetTeams(teams), [...teams, null]);
  });

  it("offers No team when there are no folders", () => {
    assert.deepEqual(moveTargetTeams([]), [null]);
  });
});
