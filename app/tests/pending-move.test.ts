import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  claimMove,
  clearPendingMove,
  isMoveClaimed,
  type PendingAgentMove,
  readPendingMoves,
  recordPendingMove,
  releaseMove,
  updatePendingMoveId,
} from "../src/lib/pending-move.ts";

function fakeStorage(seed?: string) {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set("houston.pendingAgentMoves", seed);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => map.get("houston.pendingAgentMoves") ?? null,
  };
}

function move(over: Partial<PendingAgentMove> = {}): PendingAgentMove {
  return {
    agentId: "7af3d710003ad396",
    agentName: "Nova",
    teamSlug: "abcdef0123456789",
    teamName: "Acme",
    moveId: "op-1",
    startedAt: 1_000,
    ...over,
  };
}

describe("pending-move persistence", () => {
  it("records, reads back, and clears", () => {
    const s = fakeStorage();
    recordPendingMove(move(), s);
    deepStrictEqual(readPendingMoves(s), [move()]);
    clearPendingMove("7af3d710003ad396", s);
    deepStrictEqual(readPendingMoves(s), []);
    // Emptying removes the key entirely rather than storing "[]".
    strictEqual(s.dump(), null);
  });

  it("upserts per agent: a re-record replaces the old ticket", () => {
    const s = fakeStorage();
    recordPendingMove(move({ moveId: "op-1" }), s);
    recordPendingMove(move({ moveId: "op-2" }), s);
    deepStrictEqual(readPendingMoves(s), [move({ moveId: "op-2" })]);
  });

  it("keeps other agents' records independent", () => {
    const s = fakeStorage();
    recordPendingMove(move(), s);
    recordPendingMove(move({ agentId: "b".repeat(16), moveId: "op-9" }), s);
    clearPendingMove("7af3d710003ad396", s);
    deepStrictEqual(readPendingMoves(s), [
      move({ agentId: "b".repeat(16), moveId: "op-9" }),
    ]);
  });

  it("re-keys an adopted move to its new ticket", () => {
    const s = fakeStorage();
    recordPendingMove(move({ moveId: "op-1" }), s);
    updatePendingMoveId("7af3d710003ad396", "op-2", s);
    deepStrictEqual(readPendingMoves(s), [move({ moveId: "op-2" })]);
  });

  it("reads unreadable or malformed state as no pending moves", () => {
    deepStrictEqual(readPendingMoves(fakeStorage("not json")), []);
    deepStrictEqual(readPendingMoves(fakeStorage('{"a":1}')), []);
    deepStrictEqual(readPendingMoves(fakeStorage('[{"agentId":1}]')), []);
    deepStrictEqual(readPendingMoves(null), []);
  });

  it("claims are exclusive per agent and releasable", () => {
    strictEqual(claimMove("agent-x"), true);
    strictEqual(claimMove("agent-x"), false);
    strictEqual(isMoveClaimed("agent-x"), true);
    strictEqual(isMoveClaimed("agent-y"), false);
    releaseMove("agent-x");
    strictEqual(isMoveClaimed("agent-x"), false);
    strictEqual(claimMove("agent-x"), true);
    releaseMove("agent-x");
  });
});
