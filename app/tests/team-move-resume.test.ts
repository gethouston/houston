import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingTeamMove } from "../src/lib/pending-team-move.ts";
import {
  drivePendingTeamMove,
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
});
