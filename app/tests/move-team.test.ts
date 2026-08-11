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
  teamPostscriptFailed,
} from "../src/lib/move-team.ts";

const TARGET = { slug: "abcdef0123456789", name: "Acme" };
const SOURCE: TeamMoveSource = {
  id: "design",
  name: "Design",
  isDefault: false,
  agents: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

describe("team move state machine", () => {
  it("walks every named-team stage in order", () => {
    strictEqual(initialTeamMoveState().step, "pick");
    let state = confirmTeamMove(TARGET);
    state = startTeamAgents(state);
    deepStrictEqual(state, { step: "movingAgents", target: TARGET, index: 0 });
    state = agentMoveDone(state, SOURCE);
    deepStrictEqual(state, { step: "movingAgents", target: TARGET, index: 1 });
    state = agentMoveDone(state, SOURCE);
    strictEqual(state.step, "cleanupSource");
    state = postscriptDone(state, SOURCE);
    strictEqual(state.step, "switching");
    state = postscriptDone(state, SOURCE);
    strictEqual(state.step, "recreate");
    state = postscriptDone(state, SOURCE, "new-team");
    deepStrictEqual(state, {
      step: "placing",
      target: TARGET,
      teamId: "new-team",
    });
    state = postscriptDone(state, SOURCE);
    strictEqual(state.step, "invite");
    strictEqual(finishTeamMove(state).step, "done");
  });

  it("skips cleanup, recreate and placing for the default team", () => {
    const source = { ...SOURCE, isDefault: true, agents: [SOURCE.agents[0]] };
    let state = startTeamAgents(confirmTeamMove(TARGET));
    state = agentMoveDone(state, source);
    strictEqual(state.step, "switching");
    state = postscriptDone(state, source);
    strictEqual(state.step, "invite");
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

  for (const step of [
    "cleanupSource",
    "switching",
    "recreate",
    "placing",
  ] as const) {
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
      isTeamMoveDismissable({ step: "recreate", target: TARGET }),
      false,
    );
  });
});
