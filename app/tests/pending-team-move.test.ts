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
    context: "Brand",
    isDefault: false,
  },
  targetSlug: "abcdef0123456789",
  targetName: "Acme",
  agentIds: ["a", "b"],
  startedAt: 10,
};

describe("pending team moves", () => {
  it("round-trips, updates and clears the sibling store", () => {
    const target = storage();
    recordPendingTeamMove(MOVE, target);
    deepStrictEqual(readPendingTeamMoves(target), [MOVE]);
    updatePendingTeamMove("design", { createdTeamId: "new" }, target);
    strictEqual(readPendingTeamMoves(target)[0].createdTeamId, "new");
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
});
