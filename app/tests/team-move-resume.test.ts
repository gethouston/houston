import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  canRetryTeamMove,
  teamAgentMoveFailed,
  teamMoveFailureCopy,
} from "../src/lib/move-team.ts";
import type { PendingTeamMove } from "../src/lib/pending-team-move.ts";
import {
  drivePendingTeamMove,
  resumableAtBoot,
  resumedTeamMove,
  teamMoveAgentsSettled,
} from "../src/lib/team-move-resume.ts";

const PENDING: PendingTeamMove = {
  sourceTeam: { id: "old", workspaceId: "default", name: "Design" },
  targetSlug: "abcdef0123456789",
  targetName: "Acme",
  targetGroupId: "target-folder",
  agentIds: ["a", "b"],
  movedAgentIds: [],
  startedAt: 1,
};

describe("team move resume", () => {
  it("settles only from durable moved-agent checkpoints", () => {
    strictEqual(teamMoveAgentsSettled(PENDING), false);
    strictEqual(
      teamMoveAgentsSettled({ ...PENDING, movedAgentIds: ["a", "b"] }),
      true,
    );
  });

  it("restores the full source list and failing agent after a remount", () => {
    const resumed = resumedTeamMove(
      { ...PENDING, movedAgentIds: ["a"] },
      {
        id: "old",
        workspaceId: "default",
        name: "Design",
        agents: [{ id: "b", name: "Bee" }],
      },
    );
    deepStrictEqual(resumed.source.agents, [
      { id: "a", name: "a" },
      { id: "b", name: "Bee" },
    ]);
    deepStrictEqual(resumed.state, {
      step: "moveFailed",
      target: { slug: PENDING.targetSlug, name: PENDING.targetName },
      index: 1,
      error: "unknown",
    });
  });

  it("resumes folder setup when every agent has moved", () => {
    strictEqual(
      resumedTeamMove(
        { ...PENDING, movedAgentIds: ["a", "b"] },
        { id: "old", workspaceId: "default", name: "Design", agents: [] },
      ).state.step,
      "postscriptFailed",
    );
  });

  it("creates and drives missing per-agent tickets before folder setup", async () => {
    const events: string[] = [];
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: (move) => void events.push(`record:${move.agentId}`),
      updateAgentMoveId: (_id, moveId) => void events.push(`ticket:${moveId}`),
      clearAgentMove: (id) => void events.push(`clear:${id}`),
      markAgentMoved: (id) => void events.push(`moved:${id}`),
      resumeAgentMove: async (_move, options) => {
        options.onMoveAccepted?.("accepted");
        return { outcome: "done" };
      },
      runPostscript: async () => void events.push("folder"),
    });
    deepStrictEqual(result, { outcome: "done" });
    deepStrictEqual(events, [
      "record:a",
      "ticket:accepted",
      "clear:a",
      "moved:a",
      "record:b",
      "ticket:accepted",
      "clear:b",
      "moved:b",
      "folder",
    ]);
  });

  it("skips agents recorded as moved and resumes the rest", async () => {
    const moved: string[] = [];
    await drivePendingTeamMove(
      { ...PENDING, movedAgentIds: ["a"] },
      {
        readAgentMove: () => undefined,
        recordAgentMove: () => {},
        updateAgentMoveId: () => {},
        clearAgentMove: () => {},
        markAgentMoved: (id) => void moved.push(id),
        resumeAgentMove: async (move) => {
          moved.push(`resume:${move.agentId}`);
          return { outcome: "done" };
        },
        runPostscript: async () => void moved.push("folder"),
      },
    );
    deepStrictEqual(moved, ["resume:b", "b", "folder"]);
  });

  it("stops a failed agent before folder setup", async () => {
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: () => {},
      updateAgentMoveId: () => {},
      clearAgentMove: () => {},
      markAgentMoved: () => {},
      resumeAgentMove: async () => ({ outcome: "timeout" }),
      runPostscript: async () => {
        throw new Error("folder setup must wait");
      },
    });
    deepStrictEqual(result, { outcome: "failed", agentId: "a" });
  });

  it("stops on a name the team already holds, voiding only that agent's ticket", async () => {
    const events: string[] = [];
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: (move) => void events.push(`record:${move.agentId}`),
      updateAgentMoveId: () => {},
      clearAgentMove: (id) => void events.push(`clear:${id}`),
      markAgentMoved: (id) => void events.push(`moved:${id}`),
      resumeAgentMove: async () => ({ outcome: "refused", code: "name_taken" }),
      runPostscript: async () => {
        throw new Error("folder setup must wait");
      },
    });
    deepStrictEqual(result, { outcome: "refused", agentId: "a" });
    deepStrictEqual(events, ["record:a", "clear:a"]);
  });

  it("settles an agent in neither space and moves on: nothing is left to move", async () => {
    const events: string[] = [];
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: () => {},
      updateAgentMoveId: () => {},
      clearAgentMove: (id) => void events.push(`clear:${id}`),
      markAgentMoved: (id) => void events.push(`moved:${id}`),
      resumeAgentMove: async (move) =>
        move.agentId === "a" ? { outcome: "gone" } : { outcome: "done" },
      runPostscript: async () => void events.push("folder"),
    });
    deepStrictEqual(result, { outcome: "done" });
    deepStrictEqual(events, [
      "clear:a",
      "moved:a",
      "clear:b",
      "moved:b",
      "folder",
    ]);
  });

  it("leaves a move parked on a taken name to the dialog, never the boot", () => {
    strictEqual(resumableAtBoot(PENDING), true);
    strictEqual(resumableAtBoot({ ...PENDING, refusedAgentId: "b" }), false);
  });

  it("reopens a parked move naming the agent to rename, with its retry", () => {
    const { source, state } = resumedTeamMove(
      { ...PENDING, movedAgentIds: ["a"], refusedAgentId: "b" },
      {
        id: "old",
        workspaceId: "default",
        name: "Design",
        agents: [{ id: "b", name: "Bee" }],
      },
    );
    if (state.step !== "moveFailed") throw new Error(state.step);
    deepStrictEqual(
      teamMoveFailureCopy(
        state.index,
        source.agents.length,
        state.error,
        source.agents[state.index]?.name,
      ),
      { key: "moveFailedNextNameTaken", moved: 1, total: 2, name: "Bee" },
    );
    strictEqual(canRetryTeamMove(state), true);
  });

  it("offers no retry on the live refusal, before any rename", () => {
    const live = teamAgentMoveFailed(
      { step: "movingAgents", target: { slug: "s", name: "Acme" }, index: 1 },
      "name_taken",
    );
    if (live.step !== "moveFailed") throw new Error(live.step);
    strictEqual(canRetryTeamMove(live), false);
  });
});
