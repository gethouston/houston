import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AgentTeam } from "@houston-ai/engine-client";
import type { TeamMoveSource, TeamMoveState } from "../src/lib/move-team.ts";
import {
  runTeamMoveStage,
  type TeamMoveStageWire,
} from "../src/lib/team-move-stage.ts";

const TARGET = { slug: "abcdef0123456789", name: "Acme" };
const SOURCE: TeamMoveSource = {
  id: "old",
  name: "Design",
  context: "Brand",
  isDefault: false,
  agents: [{ id: "a", name: "A" }],
};
const TEAM: AgentTeam = {
  id: "new",
  name: "Design",
  isDefault: false,
  sortOrder: 1,
  agentSlugs: [],
  memberCount: 1,
  joined: true,
  owner: true,
};

function wire(fail?: string) {
  const calls: string[] = [];
  const run = async (name: string) => {
    calls.push(name);
    if (fail === name) throw new Error(name);
  };
  const value: TeamMoveStageWire = {
    deleteSource: async () => run("cleanupSource"),
    switchTarget: async () => run("switching"),
    listTargetTeams: async () => {
      await run("recreate");
      return [TEAM];
    },
    createTargetTeam: async () => TEAM,
    updateTargetTeam: async () => run("context"),
    placeAgent: async () => run("placing"),
    isMissingSource: () => false,
  };
  return { value, calls };
}

describe("dialog postscript stages", () => {
  it("advances each stage and preserves the reconciled id for placement", async () => {
    const cleanup = await runTeamMoveStage(
      { step: "cleanupSource", target: TARGET },
      SOURCE,
      wire().value,
    );
    strictEqual(cleanup.state.step, "switching");
    const switched = await runTeamMoveStage(
      cleanup.state,
      SOURCE,
      wire().value,
    );
    strictEqual(switched.state.step, "recreate");
    const recreated = await runTeamMoveStage(
      switched.state,
      SOURCE,
      wire().value,
    );
    deepStrictEqual(recreated.state, {
      step: "placing",
      target: TARGET,
      teamId: "new",
    });
    const placed = await runTeamMoveStage(
      recreated.state,
      SOURCE,
      wire().value,
    );
    strictEqual(placed.state.step, "invite");
  });
  for (const stage of [
    "cleanupSource",
    "switching",
    "recreate",
    "placing",
  ] as const) {
    it(`rejects in ${stage} so the machine can resume exactly there`, async () => {
      const state: TeamMoveState =
        stage === "placing"
          ? { step: stage, target: TARGET, teamId: "new" }
          : { step: stage, target: TARGET };
      await rejects(() => runTeamMoveStage(state, SOURCE, wire(stage).value));
    });
  }
  it("treats an already-deleted source as complete", async () => {
    const target = wire("cleanupSource");
    target.value.isMissingSource = () => true;
    strictEqual(
      (
        await runTeamMoveStage(
          { step: "cleanupSource", target: TARGET },
          SOURCE,
          target.value,
        )
      ).state.step,
      "switching",
    );
  });
});
