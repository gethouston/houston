import { expect, test } from "vitest";
import { ApprovalStore } from "./approvals";
import { applyApprovalReceipts } from "./receipts";

/**
 * A4 / A5 — where a person's yes becomes a receipt, and everything that must
 * NOT become one: a replayed reply, an answer from another chat, a card the
 * user walked away from, and anything a runtime could put on the wire itself.
 */

const AGENT = "Personal/.assistant";
const CONV = "assistant";

function issued(store: ApprovalStore, params: Record<string, unknown> = {}) {
  return store.issue({
    operation: "deleteAgent",
    params,
    agentId: AGENT,
    conversationId: CONV,
    summary: "Delete an agent.",
  });
}

/** One user message arriving with (or without) receipts on its own field. */
function reply(store: ApprovalStore, field?: unknown) {
  return applyApprovalReceipts({
    approvals: store,
    agentId: AGENT,
    conversationId: CONV,
    field,
  });
}

test("the user's answer mints exactly one receipt", () => {
  const store = new ApprovalStore();
  const request = issued(store);

  expect(
    reply(store, [{ requestId: request.requestId, decision: "approve" }]),
  ).toBe(1);
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "deleteAgent",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("approved");
});

test("A4: replaying the same reply mints nothing, because there is nothing left to answer", () => {
  const store = new ApprovalStore();
  const request = issued(store);
  const answer = [{ requestId: request.requestId, decision: "approve" }];
  expect(reply(store, answer)).toBe(1);
  store.consume({
    requestId: request.requestId,
    operation: "deleteAgent",
    params: {},
    agentId: AGENT,
    conversationId: CONV,
  });
  expect(reply(store, answer)).toBe(0);
});

test("A4: answering twice in one message decides it once", () => {
  const store = new ApprovalStore();
  const request = issued(store);
  expect(
    reply(store, [
      { requestId: request.requestId, decision: "approve" },
      { requestId: request.requestId, decision: "deny" },
    ]),
  ).toBe(1);
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "deleteAgent",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("approved");
});

test("an answer from another conversation decides nothing", () => {
  const store = new ApprovalStore();
  const request = issued(store);
  expect(
    applyApprovalReceipts({
      approvals: store,
      agentId: AGENT,
      conversationId: "some-other-chat",
      field: [{ requestId: request.requestId, decision: "approve" }],
    }),
  ).toBe(0);
});

/**
 * A4 — dismissal, `/clear`, an edited-out turn: every one of them ends with the
 * user sending something that is not an answer, and the card is gone from their
 * screen. So it is gone from here: a pending survives only the message that
 * answers it.
 */
test("a message that answers nothing retires every card the user walked away from", () => {
  const store = new ApprovalStore();
  const abandoned = issued(store, { id: "a" });
  reply(store);
  expect(store.hasPending(AGENT, CONV)).toBe(false);
  expect(
    store.consume({
      requestId: abandoned.requestId,
      operation: "deleteAgent",
      params: { id: "a" },
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("none");
});

test("answering one card retires the others raised beside it", () => {
  const store = new ApprovalStore();
  const answered = issued(store, { id: "a" });
  const ignored = issued(store, { id: "b" });
  reply(store, [{ requestId: answered.requestId, decision: "approve" }]);
  expect(
    store.consume({
      requestId: ignored.requestId,
      operation: "deleteAgent",
      params: { id: "b" },
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("none");
  expect(
    store.consume({
      requestId: answered.requestId,
      operation: "deleteAgent",
      params: { id: "a" },
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("approved");
});

test("a receipt the model tried to author decides nothing: the id is unguessable", () => {
  const store = new ApprovalStore();
  issued(store);
  expect(reply(store, [{ requestId: "made-up", decision: "approve" }])).toBe(0);
});

test("a malformed receipts field approves nothing and still retires the card", () => {
  const store = new ApprovalStore();
  const request = issued(store);
  expect(reply(store, "approve")).toBe(0);
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "deleteAgent",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("none");
});
