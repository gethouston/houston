import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  claimTeamMove,
  clearPendingTeamMove,
  type PendingTeamMove,
  readPendingTeamMoves,
  recordPendingTeamMove,
  releaseTeamMove,
  updatePendingTeamMove,
} from "../src/lib/pending-team-move.ts";

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}
const MOVE: PendingTeamMove = {
  sourceTeam: {
    id: "design",
    name: "Design",
    icon: "palette",
    color: "blue",
    workspaceId: "default",
  },
  targetSlug: "abcdef0123456789",
  targetName: "Acme",
  targetGroupId: "target-folder",
  agentIds: ["a", "b"],
  movedAgentIds: [],
  startedAt: 10,
};

describe("pending team moves", () => {
  it("round-trips, updates and clears the sibling store", () => {
    const target = storage();
    recordPendingTeamMove(MOVE, target);
    deepStrictEqual(readPendingTeamMoves(target), [MOVE]);
    updatePendingTeamMove(
      "design",
      { postscriptStage: "cleanupSource" },
      target,
    );
    strictEqual(
      readPendingTeamMoves(target)[0].postscriptStage,
      "cleanupSource",
    );
    clearPendingTeamMove("design", target);
    deepStrictEqual(readPendingTeamMoves(target), []);
  });
  it("rejects malformed data and arbitrates dialog vs healer", () => {
    const target = storage();
    target.setItem("houston.pendingTeamMoves", "bad");
    deepStrictEqual(readPendingTeamMoves(target), []);
    strictEqual(claimTeamMove("design"), true);
    strictEqual(claimTeamMove("design"), false);
    releaseTeamMove("design");
    strictEqual(claimTeamMove("design"), true);
    releaseTeamMove("design");
  });
  it("rejects a record missing its destination folder id", () => {
    const target = storage();
    const { targetGroupId: _, ...invalid } = MOVE;
    target.setItem("houston.pendingTeamMoves", JSON.stringify([invalid]));
    deepStrictEqual(readPendingTeamMoves(target), []);
    strictEqual(target.getItem("houston.pendingTeamMoves"), null);
  });
  it("prunes an old record and reports it once", () => {
    const target = storage();
    const reports: unknown[] = [];
    const { targetGroupId: _, ...old } = MOVE;
    target.setItem("houston.pendingTeamMoves", JSON.stringify([old, MOVE]));
    deepStrictEqual(
      readPendingTeamMoves(target, (error) => reports.push(error)),
      [MOVE],
    );
    deepStrictEqual(
      JSON.parse(target.getItem("houston.pendingTeamMoves") ?? ""),
      [MOVE],
    );
    readPendingTeamMoves(target, (error) => reports.push(error));
    strictEqual(reports.length, 1);
  });
  it("rejects checkpoints for agents outside the folder move", () => {
    const target = storage();
    target.setItem(
      "houston.pendingTeamMoves",
      JSON.stringify([{ ...MOVE, movedAgentIds: ["other"] }]),
    );
    deepStrictEqual(readPendingTeamMoves(target), []);
  });
  it("appends moved agents without losing existing checkpoints", () => {
    const target = storage();
    recordPendingTeamMove(MOVE, target);
    updatePendingTeamMove("design", { movedAgentIds: ["a"] }, target);
    updatePendingTeamMove("design", { movedAgentIds: ["a", "b"] }, target);
    deepStrictEqual(readPendingTeamMoves(target)[0].movedAgentIds, ["a", "b"]);
  });
});
