import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  agentMoveDone,
  confirmTeamMove,
  finishTeamMove,
  initialTeamMoveState,
  isTeamMoveDismissable,
  postscriptDone,
  retryTeamMove,
  startTeamAgents,
  type TeamMoveSource,
  teamAgentMoveFailed,
  teamMoveFailureCopy,
  teamPostscriptFailed,
} from "../src/lib/move-team.ts";

const TARGET = { slug: "abcdef0123456789", name: "Acme" };
const SOURCE: TeamMoveSource = {
  id: "design",
  name: "Design",
  workspaceId: "default",
  agents: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

describe("team move state machine", () => {
  it("moves agents, creates the destination folder, removes the source, then switches", () => {
    strictEqual(initialTeamMoveState().step, "pick");
    let state = startTeamAgents(confirmTeamMove(TARGET));
    deepStrictEqual(state, { step: "movingAgents", target: TARGET, index: 0 });
    state = agentMoveDone(state, SOURCE);
    deepStrictEqual(state, { step: "movingAgents", target: TARGET, index: 1 });
    state = agentMoveDone(state, SOURCE);
    strictEqual(state.step, "createTarget");
    state = postscriptDone(state);
    strictEqual(state.step, "cleanupSource");
    state = postscriptDone(state);
    strictEqual(state.step, "switching");
    state = postscriptDone(state);
    strictEqual(state.step, "invite");
    strictEqual(finishTeamMove(state).step, "done");
  });

  it("records exact progress and retries the failed agent", () => {
    let state = startTeamAgents(confirmTeamMove(TARGET));
    state = agentMoveDone(state, SOURCE);
    state = teamAgentMoveFailed(state, "timeout");
    deepStrictEqual(state, {
      step: "moveFailed",
      target: TARGET,
      index: 1,
      error: "timeout",
    });
    deepStrictEqual(retryTeamMove(state), {
      step: "movingAgents",
      target: TARGET,
      index: 1,
    });
  });

  for (const step of ["createTarget", "cleanupSource", "switching"] as const) {
    it(`resumes ${step} without restarting moves`, () => {
      const failed = teamPostscriptFailed({ step, target: TARGET });
      strictEqual(failed.step, "postscriptFailed");
      strictEqual(retryTeamMove(failed).step, step);
    });
  }

  it("locks only active mutation stages", () => {
    strictEqual(isTeamMoveDismissable(confirmTeamMove(TARGET)), true);
    strictEqual(
      isTeamMoveDismissable(startTeamAgents(confirmTeamMove(TARGET))),
      false,
    );
    strictEqual(
      isTeamMoveDismissable({ step: "createTarget", target: TARGET }),
      false,
    );
  });
});

describe("team move failure copy", () => {
  it("claims nothing moved when the FIRST agent is the one that refused", () => {
    // The run stops at the first refusal, so index 0 means the whole team is
    // still where it was. Counting the team is the only honest number here.
    deepStrictEqual(teamMoveFailureCopy(0, 1), {
      key: "moveFailedFirst",
      count: 1,
    });
    deepStrictEqual(teamMoveFailureCopy(0, 4), {
      key: "moveFailedFirst",
      count: 4,
    });
  });

  it("reports how far it got, and blames the NEXT agent, never the rest", () => {
    // Two of five moved and the third refused: agents four and five were never
    // attempted, which is why the copy speaks of one next agent and not of
    // "one of the five".
    deepStrictEqual(teamMoveFailureCopy(2, 5), {
      key: "moveFailedNext",
      moved: 2,
      total: 5,
    });
    deepStrictEqual(teamMoveFailureCopy(1, 2), {
      key: "moveFailedNext",
      moved: 1,
      total: 2,
    });
  });

  it("treats a negative index as no progress rather than as a count", () => {
    deepStrictEqual(teamMoveFailureCopy(-1, 3), {
      key: "moveFailedFirst",
      count: 3,
    });
  });
});
