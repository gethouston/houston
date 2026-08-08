import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentsInTeams } from "../src/components/shell/team-sidebar-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

// What the rail may DRAW once the teams are split into joined and other: the
// grouped list files every unclaimed item under the default block, so a
// non-joined team's agents must never reach it.

const agent = (id: string): Agent =>
  ({ id, name: id, configId: "c", folderPath: `/w/${id}` }) as Agent;

const team = (id: string, agents: Agent[], isDefault = false): TeamView => ({
  id,
  name: id,
  agents,
  isDefault,
});

describe("agentsInTeams", () => {
  it("drops the agents no listed team holds", () => {
    const [a, b, c] = [agent("a"), agent("b"), agent("c")];
    const kept = agentsInTeams(
      [a, b, c],
      [team("t1", [a]), team("t2", [c], true)],
    );
    assert.deepEqual(
      kept.map((x) => x.id),
      ["a", "c"],
    );
  });

  it("keeps the agent-store order, not the teams' order", () => {
    const [a, b] = [agent("a"), agent("b")];
    const kept = agentsInTeams([a, b], [team("t1", [b]), team("t2", [a])]);
    assert.deepEqual(
      kept.map((x) => x.id),
      ["a", "b"],
    );
  });

  it("returns the SAME array when every agent is held (the local backend)", () => {
    const agents = [agent("a"), agent("b")];
    const teams = [team("t1", [agents[0]]), team("ws", [agents[1]], true)];
    assert.equal(agentsInTeams(agents, teams), agents);
  });

  it("returns the same array for no agents at all", () => {
    const agents: Agent[] = [];
    assert.equal(agentsInTeams(agents, []), agents);
  });

  it("drops everything when no team is listed but agents exist", () => {
    assert.deepEqual(agentsInTeams([agent("a")], []), []);
  });

  it("counts an agent once when two teams both name it", () => {
    const a = agent("a");
    const kept = agentsInTeams([a], [team("t1", [a]), team("t2", [a])]);
    assert.deepEqual(
      kept.map((x) => x.id),
      ["a"],
    );
  });
});
