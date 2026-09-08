import { expect, test } from "vitest";
import { APPROVAL_TTL_MS, ApprovalStore, approvalKey } from "./approvals";

/**
 * The store's own contract. The end-to-end binding is pinned where it matters
 * (`routes/assistant-sandbox.test.ts` for the route, `receipts.test.ts` for the
 * user's reply); these are the rules that make it unforgeable.
 */

const AGENT = "Personal/.assistant";
const CONV = "assistant";

function approved(
  store: ApprovalStore,
  operation: string,
  params: Record<string, unknown>,
) {
  const request = store.issue({
    operation,
    params,
    agentId: AGENT,
    conversationId: CONV,
    summary: "s",
  });
  store.decide({
    requestId: request.requestId,
    agentId: AGENT,
    conversationId: CONV,
    decision: "approve",
  });
  return request;
}

test("the key changes with anything that changes what the call would do", () => {
  expect(approvalKey("del", { id: "a" })).toBe(approvalKey("del", { id: "a" }));
  // Argument ORDER is not meaning; array order is.
  expect(approvalKey("del", { a: 1, b: 2 })).toBe(
    approvalKey("del", { b: 2, a: 1 }),
  );
  expect(approvalKey("del", { ids: [1, 2] })).not.toBe(
    approvalKey("del", { ids: [2, 1] }),
  );
  expect(approvalKey("del", { id: "a" })).not.toBe(
    approvalKey("del", { id: "b" }),
  );
  expect(approvalKey("del", { id: "a" })).not.toBe(
    approvalKey("archive", { id: "a" }),
  );
  // An undefined value is the same as an absent one, in both spellings.
  expect(approvalKey("del", { id: "a", note: undefined })).toBe(
    approvalKey("del", { id: "a" }),
  );
});

test("request ids are unguessable and never repeat", () => {
  const store = new ApprovalStore();
  const ids = new Set(
    Array.from({ length: 50 }, () => approved(store, "del", {}).requestId),
  );
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
});

test("an undecided request authorizes nothing", () => {
  const store = new ApprovalStore();
  const request = store.issue({
    operation: "del",
    params: {},
    agentId: AGENT,
    conversationId: CONV,
    summary: "s",
  });
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "del",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("none");
});

test("a decision is written once: a second answer cannot flip it", () => {
  const store = new ApprovalStore();
  const request = approved(store, "del", {});
  expect(
    store.decide({
      requestId: request.requestId,
      agentId: AGENT,
      conversationId: CONV,
      decision: "deny",
    }),
  ).toBe(false);
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "del",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("approved");
});

test("another agent cannot answer, spend, or even see this request", () => {
  const store = new ApprovalStore();
  const request = approved(store, "del", {});
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "del",
      params: {},
      agentId: "Work/Sales",
      conversationId: CONV,
    }),
  ).toBe("none");
  expect(store.hasPending("Work/Sales", CONV)).toBe(false);
});

test("a request expires, and an expired one is neither answerable nor spendable", () => {
  let now = 1_000;
  const store = new ApprovalStore(() => now);
  const request = approved(store, "del", {});
  now += APPROVAL_TTL_MS + 1;
  expect(
    store.consume({
      requestId: request.requestId,
      operation: "del",
      params: {},
      agentId: AGENT,
      conversationId: CONV,
    }),
  ).toBe("none");
  expect(store.hasPending(AGENT, CONV)).toBe(false);
});

test("clearing a conversation forgets its requests and leaves the others", () => {
  const store = new ApprovalStore();
  approved(store, "del", {});
  const elsewhere = store.issue({
    operation: "del",
    params: {},
    agentId: AGENT,
    conversationId: "other",
    summary: "s",
  });
  store.clear(AGENT, CONV);
  expect(store.hasPending(AGENT, CONV)).toBe(false);
  expect(store.hasPending(AGENT, "other")).toBe(true);
  expect(elsewhere.conversationId).toBe("other");
});
