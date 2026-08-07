import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
