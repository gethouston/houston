import { expect, test } from "vitest";
import { parseTurnBody } from "../routes/turn-body";
import { ApprovalStore } from "./approvals";
import { ApprovalMessageGuard } from "./message-guard";
import { prepareMessageReceipts } from "./message-receipts";

const agentId = "Personal/.assistant";
const conversationId = "assistant";
const issue = (store: ApprovalStore) =>
  store.issue({
    agentId,
    conversationId,
    operation: "deleteAgent",
    params: { id: "target" },
    summary: "Delete target",
  });
const prepare = (
  store: ApprovalStore,
  body: Record<string, unknown>,
  actor = "user-a",
) => prepareFrom(store, Buffer.from(JSON.stringify(body)), actor);

const prepareFrom = (store: ApprovalStore, body: Buffer, actor = "user-a") =>
  prepareMessageReceipts({
    approvals: store,
    agentId,
    conversationId,
    actor,
    body,
    parsed: parseTurnBody(body),
  });

test("retrying an approved message does not delete the unspent receipt", () => {
  const store = new ApprovalStore();
  const request = issue(store);
  const body = {
    text: "yes",
    nonce: "n",
    approvals: [{ requestId: request.requestId, decision: "approve" }],
  };
  prepare(store, body);
  const retry = prepare(store, body);
  expect(retry.duplicate).toBe(true);
  expect(retry.body.toString()).not.toContain("approvals");
  expect(
    store.consume({
      agentId,
      conversationId,
      requestId: request.requestId,
      operation: "deleteAgent",
      params: { id: "target" },
    }),
  ).toBe("approved");
});

test("a retry of the prompt that raised a card leaves that new card pending", () => {
  const store = new ApprovalStore();
  prepare(store, { text: "delete target", nonce: "n" });
  const request = issue(store);
  prepare(store, { text: "delete target", nonce: "n" });
  expect(
    store.pending(request.requestId, agentId, conversationId),
  ).toBeDefined();
});

test.each([
  "body",
  "actor",
  "approval",
])("a nonce conflict in %s is refused before it changes any approval", (change) => {
  const store = new ApprovalStore();
  prepare(store, { text: "original", nonce: "n" });
  const request = issue(store);
  const approvals = [{ requestId: request.requestId, decision: "approve" }];
  expect(() =>
    prepare(
      store,
      {
        text: change === "body" ? "different" : "original",
        nonce: "n",
        ...(change === "approval" ? { approvals } : {}),
      },
      change === "actor" ? "user-b" : "user-a",
    ),
  ).toThrow("nonce_conflict");
  expect(
    store.pending(request.requestId, agentId, conversationId),
  ).toBeDefined();
});

test("a definitive pre-accept refusal releases the guard for corrected input", () => {
  const store = new ApprovalStore();
  const first = prepare(store, { text: "original", nonce: "n" });
  first.release?.();
  expect(() => prepare(store, { text: "corrected", nonce: "n" })).not.toThrow();
});

test("a duplicate cannot release the original request's guard", () => {
  const store = new ApprovalStore();
  prepare(store, { text: "original", nonce: "n" });
  expect(
    prepare(store, { text: "original", nonce: "n" }).release,
  ).toBeUndefined();
});

test("guard capacity fails closed and expires with the approval lifecycle", () => {
  let now = 0;
  const guard = new ApprovalMessageGuard(() => now, 1);
  expect(guard.reserve(agentId, conversationId, "one", "content").kind).toBe(
    "new",
  );
  expect(guard.reserve(agentId, conversationId, "two", "content").kind).toBe(
    "full",
  );
  now = 10 * 60_000;
  expect(guard.reserve(agentId, conversationId, "two", "content").kind).toBe(
    "new",
  );
});

test("invalid nonce cannot grant or retire an approval", () => {
  const store = new ApprovalStore();
  const request = issue(store);
  expect(() => prepare(store, { text: "yes", nonce: "" })).toThrow(
    "invalid_nonce",
  );
  expect(
    store.pending(request.requestId, agentId, conversationId),
  ).toBeDefined();
});

test("changing gateway context and JSON property order does not change sender intent", () => {
  const store = new ApprovalStore();
  prepare(store, { text: "original", nonce: "n", workspaceContext: "old" });
  expect(
    prepare(store, { workspaceContext: "new", nonce: "n", text: "original" })
      .duplicate,
  ).toBe(true);
});

test("host retry metadata is authored locally, never copied from the caller", () => {
  const result = prepare(new ApprovalStore(), {
    text: "original",
    nonce: "n",
    hostMessageFingerprint: "f".repeat(64),
  });
  const body = JSON.parse(result.body.toString()) as {
    hostMessageFingerprint: string;
  };
  expect(body.hostMessageFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(body.hostMessageFingerprint).not.toBe("f".repeat(64));
});

test("a textless request forwards neither receipts nor caller retry metadata", () => {
  const store = new ApprovalStore();
  const request = issue(store);
  const result = prepare(store, {
    nonce: "n",
    approvals: [{ requestId: request.requestId, decision: "approve" }],
    hostMessageFingerprint: "f".repeat(64),
  });
  expect(JSON.parse(result.body.toString())).toEqual({ nonce: "n" });
  // Nothing was admitted, so the card is still the user's to answer.
  expect(
    store.pending(request.requestId, agentId, conversationId),
  ).toBeDefined();
  expect(result.release).toBeUndefined();
  expect(result.duplicate).toBeUndefined();
});

test("a body that is not this route's JSON is forwarded untouched", () => {
  const store = new ApprovalStore();
  issue(store);
  const body = Buffer.from("not json at all");
  expect(prepareFrom(store, body).body).toBe(body);
});

test("a message with no live card reaches the runtime as the exact bytes sent", () => {
  const store = new ApprovalStore();
  const body = Buffer.from(JSON.stringify({ text: "hello" }));
  expect(prepareFrom(store, body).body).toBe(body);
});

test("an answered message keeps every field but the receipts", () => {
  const store = new ApprovalStore();
  const request = issue(store);
  const result = prepare(store, {
    text: "Delete it?: Yes, go ahead",
    approvals: [{ requestId: request.requestId, decision: "approve" }],
    mentions: [],
  });
  expect(JSON.parse(result.body.toString())).toEqual({
    text: "Delete it?: Yes, go ahead",
    mentions: [],
  });
  expect(result.body.toString()).not.toContain(request.requestId);
});
