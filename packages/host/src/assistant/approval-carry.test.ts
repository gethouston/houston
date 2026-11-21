import { expect, test } from "vitest";
import { adoptApprovals, carryApprovals } from "./approval-carry";
import { APPROVAL_TTL_MS } from "./approval-record";
import { ApprovalStore } from "./approvals";

const AGENT = "Personal/Assistant";
const CONV = "assistant";
const SCOPE = { agentId: AGENT, conversationId: CONV };

function raise(store: ApprovalStore, conversationId = CONV) {
  return store.issue({
    operation: "deleteAgent",
    params: { agentSlugOrId: "Dobby" },
    agentId: AGENT,
    conversationId,
    summary: "Delete Dobby",
  });
}

const travel = (store: ApprovalStore) =>
  JSON.parse(JSON.stringify(carryApprovals(store, AGENT, CONV)));

test("a card raised in one worker is answered and spent in the next", () => {
  const first = new ApprovalStore();
  const request = raise(first);
  const next = new ApprovalStore();
  adoptApprovals(next, travel(first), SCOPE);
  expect(next.pending(request.requestId, AGENT, CONV)?.summary).toBe(
    "Delete Dobby",
  );
  expect(
    next.decide({
      requestId: request.requestId,
      agentId: AGENT,
      conversationId: CONV,
      decision: "approve",
    }),
  ).toBe(true);
  const call = {
    requestId: request.requestId,
    operation: "deleteAgent",
    params: { agentSlugOrId: "Dobby" },
    agentId: AGENT,
    conversationId: CONV,
  };
  expect(next.consume(call)).toBe("approved");
  const after = new ApprovalStore();
  adoptApprovals(after, travel(next), SCOPE);
  expect(after.consume(call)).toBe("none");
});

test("only this conversation's live records travel", () => {
  let now = 1_000;
  const first = new ApprovalStore(() => now);
  const here = raise(first);
  const elsewhere = raise(first, "other-chat");
  now += APPROVAL_TTL_MS + 1;
  const late = raise(first);
  const carried = carryApprovals(first, AGENT, CONV);
  expect(carried.requests.map((r) => r.requestId)).toEqual([late.requestId]);
  expect(carried.requests.map((r) => r.requestId)).not.toContain(
    here.requestId,
  );
  expect(carried.requests.map((r) => r.requestId)).not.toContain(
    elsewhere.requestId,
  );
});

test("an expired record is never adopted", () => {
  let now = 1_000;
  const first = new ApprovalStore(() => now);
  const request = raise(first);
  const carried = travel(first);
  now += APPROVAL_TTL_MS;
  const next = new ApprovalStore(() => now);
  adoptApprovals(next, carried, SCOPE);
  expect(next.pending(request.requestId, AGENT, CONV)).toBeUndefined();
});

test("a retried message is recognized across workers", () => {
  const first = new ApprovalStore();
  const reserved = first.messages.reserve(AGENT, CONV, "nonce-1", "yes");
  expect(reserved.kind).toBe("new");
  const next = new ApprovalStore();
  adoptApprovals(next, travel(first), SCOPE);
  expect(next.messages.reserve(AGENT, CONV, "nonce-1", "yes").kind).toBe(
    "duplicate",
  );
  expect(next.messages.reserve(AGENT, CONV, "nonce-1", "no").kind).toBe(
    "conflict",
  );
});

test.each([
  null,
  "junk",
  { requests: "x" },
  { requests: [{ requestId: 7 }], reservations: [{ nonce: 1 }] },
])("a malformed carry adopts nothing (%j)", (carry) => {
  const next = new ApprovalStore();
  adoptApprovals(next, carry, SCOPE);
  expect(carryApprovals(next, AGENT, CONV)).toEqual({
    requests: [],
    reservations: [],
  });
});

test("records for another agent or conversation are dropped on adoption", () => {
  const first = new ApprovalStore();
  const request = raise(first);
  const carried = travel(first);
  carried.requests[0].conversationId = "other-chat";
  const next = new ApprovalStore();
  adoptApprovals(next, carried, SCOPE);
  expect(next.pending(request.requestId, AGENT, "other-chat")).toBeUndefined();
});
