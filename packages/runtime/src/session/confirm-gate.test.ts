import { afterEach, expect, test, vi } from "vitest";
import {
  CONFIRMATION_TTL_MS,
  clearConfirmations,
  confirmationKey,
  recordConfirmationRequest,
  resolveConfirmationReply,
  takeConfirmationOutcome,
} from "./confirm-gate";

/**
 * The approval record itself: what a key covers, who can write one, and how
 * fast it stops counting. The gate's behavior through `houston_call` is pinned
 * in `tools/assistant-confirm.test.ts`; this is the store's own contract.
 */

afterEach(() => {
  clearConfirmations();
  vi.useRealTimers();
});

const request = (conversationId: string, key: string) => ({
  conversationId,
  key,
  question: "Delete an agent. Should I go ahead?",
  approveLabel: "Yes, go ahead",
  declineLabel: "No, don't do it",
});

/** The reply line the app composes when the user clicks an option. */
const reply = (req: ReturnType<typeof request>, label: string) =>
  `${req.question}: ${label}`;

test("the key covers the operation AND its arguments, whatever order they came in", () => {
  const a = confirmationKey("deleteAgent", { id: "Dobby", force: true });
  expect(confirmationKey("deleteAgent", { force: true, id: "Dobby" })).toBe(a);
  // An argument that is absent and one that is explicitly undefined are the
  // same call, so approving one approves the other.
  expect(
    confirmationKey("deleteAgent", {
      id: "Dobby",
      force: true,
      extra: undefined,
    }),
  ).toBe(a);
  expect(confirmationKey("deleteAgent", { id: "Milo", force: true })).not.toBe(
    a,
  );
  expect(
    confirmationKey("archiveAgent", { id: "Dobby", force: true }),
  ).not.toBe(a);
});

test("array order is part of the call, so it is part of the key", () => {
  expect(confirmationKey("op", { ids: ["a", "b"] })).not.toBe(
    confirmationKey("op", { ids: ["b", "a"] }),
  );
});

test("nothing is approved until the user's reply says so", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("the approve line grants exactly one use", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  expect(takeConfirmationOutcome("c1", "k1")).toBe("granted");
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("the approve line is recognized among the other answers of one card", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply(
    "c1",
    `What should I name it?: Dobby\n${reply(req, req.approveLabel)}\nConnected Gmail.`,
  );
  expect(takeConfirmationOutcome("c1", "k1")).toBe("granted");
});

test("the decline line records a refusal, also single use", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", reply(req, req.declineLabel));
  expect(takeConfirmationOutcome("c1", "k1")).toBe("declined");
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("a reply about something else decides nothing, and retires the card", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", "make Dobby blue");
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
  // The card is gone from the user's screen, so a LATER message must not be
  // able to answer it: this is what stops an old ask being resurrected.
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("an answer in one conversation decides nothing in another", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  expect(takeConfirmationOutcome("c2", "k1")).toBe("none");
  expect(takeConfirmationOutcome(undefined, "k1")).toBe("none");
});

test("an approval stops counting once the TTL is past", () => {
  vi.useFakeTimers();
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  vi.advanceTimersByTime(CONFIRMATION_TTL_MS + 1);
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("a card the user never answered stops counting too", () => {
  vi.useFakeTimers();
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  vi.advanceTimersByTime(CONFIRMATION_TTL_MS + 1);
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});

test("deleting a conversation takes its approvals with it", () => {
  const req = request("c1", "k1");
  recordConfirmationRequest(req);
  resolveConfirmationReply("c1", reply(req, req.approveLabel));
  clearConfirmations("c1");
  expect(takeConfirmationOutcome("c1", "k1")).toBe("none");
});
