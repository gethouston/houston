import { expect, test } from "vitest";
import { parseOpRequest } from "./parse-op-request";

const envelope = (op: unknown) => ({
  workspaceId: "w1",
  agentId: "a1",
  gcsPrefix: "ws/w1/a1",
  hostToken: "ht",
  claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
  op,
});

const user = {
  role: "user",
  content: "Draft the weekly report",
  ts: 1_760_000_000_000,
  turnId: "t1",
};

test("a reconcile op parses the conversation and the turn that died in it", () => {
  const parsed = parseOpRequest(
    envelope({
      kind: "reconcile",
      conversationId: "routine-r1",
      abandoned: {
        turnId: "t1",
        startedAt: "2026-06-12T12:00:00.000Z",
        routine: true,
        userMessage: user,
      },
    }),
  );
  expect(parsed.op).toEqual({
    kind: "reconcile",
    conversationId: "routine-r1",
    abandoned: {
      turnId: "t1",
      startedAt: "2026-06-12T12:00:00.000Z",
      routine: true,
      userMessage: user,
    },
  });
  expect(
    parseOpRequest(envelope({ kind: "reconcile", conversationId: "c1" })).op,
  ).toEqual({ kind: "reconcile", conversationId: "c1" });
});

test("a reconcile op refuses shapes it cannot settle safely", () => {
  const bad =
    (abandoned: unknown, conversationId: unknown = "c1") =>
    () =>
      parseOpRequest(
        envelope({ kind: "reconcile", conversationId, abandoned }),
      );
  expect(bad(undefined, "../c1")).toThrow("invalid 'op.conversationId'");
  expect(bad({ startedAt: "2026-06-12T12:00:00.000Z" })).toThrow(
    "invalid 'op.abandoned.turnId'",
  );
  expect(bad({ turnId: "t1", startedAt: "yesterday" })).toThrow(
    "invalid 'op.abandoned.startedAt'",
  );
  expect(
    bad({
      turnId: "t1",
      startedAt: "2026-06-12T12:00:00.000Z",
      userMessage: { ...user, turnId: "t2" },
    }),
  ).toThrow("invalid 'op.abandoned.userMessage'");
  expect(
    bad({
      turnId: "t1",
      startedAt: "2026-06-12T12:00:00.000Z",
      userMessage: { ...user, role: "assistant" },
    }),
  ).toThrow("invalid 'op.abandoned.userMessage'");
});
