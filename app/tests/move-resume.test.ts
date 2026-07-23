import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AgentMoveStatus } from "@houston-ai/engine-client";
import { type MoveWire, resumePendingMove } from "../src/lib/move-resume.ts";
import type { PendingAgentMove } from "../src/lib/pending-move.ts";

const PENDING: PendingAgentMove = {
  agentId: "7af3d710003ad396",
  agentName: "Nova",
  teamSlug: "abcdef0123456789",
  teamName: "Acme",
  moveId: "op-old",
  startedAt: 1_000,
};

const instant = { pollIntervalMs: 1, sleep: async () => {} };

/** A wire whose statuses play back per moveId; moveAgent yields `op-new`. */
function wire(over: {
  statuses: Record<string, AgentMoveStatus[]>;
  moveAgent?: MoveWire["moveAgent"];
}): MoveWire & { posts: string[] } {
  const posts: string[] = [];
  return {
    posts,
    moveStatus: async (_agent, moveId) => {
      const queue = over.statuses[moveId];
      if (!queue || queue.length === 0)
        throw new Error(`unexpected poll of ${moveId}`);
      return queue.length > 1 ? (queue.shift() as AgentMoveStatus) : queue[0];
    },
    moveAgent:
      over.moveAgent ??
      (async (_agent, toSlug) => {
        posts.push(toSlug);
        return { moveId: "op-new" };
      }),
  };
}

describe("resumePendingMove", () => {
  it("recognizes a move that quietly succeeded: done, no re-POST", async () => {
    const w = wire({ statuses: { "op-old": [{ status: "done" }] } });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "done",
    });
    deepStrictEqual(w.posts, []);
  });

  it("waits out a still-running move to its terminal state", async () => {
    const w = wire({
      statuses: {
        "op-old": [
          { status: "moving" },
          { status: "moving" },
          { status: "done" },
        ],
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "done",
    });
    deepStrictEqual(w.posts, []);
  });

  it("re-POSTs a failed move and follows the adopted ticket to done", async () => {
    const w = wire({
      statuses: {
        "op-old": [{ status: "failed", error: "pod evicted" }],
        "op-new": [{ status: "moving" }, { status: "done" }],
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "done",
    });
    deepStrictEqual(w.posts, ["abcdef0123456789"]);
  });

  it("surfaces a re-failed resume with the new ticket for re-keying", async () => {
    const w = wire({
      statuses: {
        "op-old": [{ status: "failed" }],
        "op-new": [{ status: "failed", error: "unmovable_volume" }],
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "failed",
      error: "unmovable_volume",
      moveId: "op-new",
    });
  });

  it("treats a lost ticket ('move not found' reads failed) as resumable", async () => {
    const w = wire({
      statuses: {
        "op-old": [{ status: "failed", error: "move not found" }],
        "op-new": [{ status: "done" }],
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "done",
    });
    deepStrictEqual(w.posts, ["abcdef0123456789"]);
  });

  it("yields inProgress when a fresh move already owns the agent", async () => {
    const w = wire({
      statuses: { "op-old": [{ status: "failed" }] },
      moveAgent: async () => {
        throw { code: "move_in_progress" };
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "inProgress",
    });
  });

  it("yields rejected (with the code) when the re-POST is refused", async () => {
    const w = wire({
      statuses: { "op-old": [{ status: "failed" }] },
      moveAgent: async () => {
        throw { body: { error: "not_member" } };
      },
    });
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "rejected",
      code: "not_member",
    });
  });

  it("yields rejected when even the first status read throws", async () => {
    const w = wire({ statuses: {} });
    w.moveStatus = async () => {
      throw { code: "unauthorized" };
    };
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "rejected",
      code: "unauthorized",
    });
  });

  it("times out a move that never settles, keeping the record", async () => {
    const w = wire({ statuses: { "op-old": [{ status: "moving" }] } });
    const result = await resumePendingMove(PENDING, w, {
      ...instant,
      budgetMs: 5,
    });
    deepStrictEqual(result, { outcome: "timeout" });
  });

  it("rides through transient poll errors within the budget", async () => {
    let polls = 0;
    const w = wire({ statuses: {} });
    w.moveStatus = async () => {
      polls += 1;
      if (polls === 1) return { status: "moving" };
      if (polls === 2) throw new Error("gateway blip");
      return { status: "done" };
    };
    deepStrictEqual(await resumePendingMove(PENDING, w, instant), {
      outcome: "done",
    });
    strictEqual(polls, 3);
  });
});
