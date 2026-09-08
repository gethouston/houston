import { expect, test, vi } from "vitest";

/**
 * The acceptance gate between a conversation's turns and its commands.
 *
 * Everything here exists for one race: `/clear` works for a while (it harvests
 * the assistant's durable facts first), and a turn accepted during that window
 * used to run against a session the clear then disposed, with its message
 * stranded above the boundary marker. The gate is what makes the two decisions
 * mutually exclusive from the instant the route says yes.
 */

const cache = vi.hoisted(() => ({
  pending: 0,
}));
vi.mock("./conversation-cache", () => ({
  conversations: { get: () => ({ pending: cache.pending }) },
}));

const {
  beginConversationCommand,
  conversationCommandBusy,
  conversationCommandInFlight,
  holdConversationTurn,
} = await import("./conversation-command-gate");

/** A promise settled by the test, standing in for a turn in flight. */
function pendingTurn(): { promise: Promise<void>; settle: () => void } {
  let settle = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

test("a turn holds the conversation against commands until it settles", async () => {
  const turn = pendingTurn();
  holdConversationTurn("held", turn.promise);

  expect(conversationCommandBusy("held")).toBe(true);

  turn.settle();
  await turn.promise;
  await Promise.resolve();
  expect(conversationCommandBusy("held")).toBe(false);
});

test("the hold spans the gap between acceptance and the turn actually running", () => {
  // A turn is accepted several awaits before it reaches the conversation queue
  // (credential sync, session build). Nothing else marks the conversation
  // during that window, which is exactly when a `/clear` used to slip in.
  const turn = pendingTurn();
  holdConversationTurn("accepted", turn.promise);

  expect(conversationCommandBusy("accepted")).toBe(true);
});

test("two turns on one conversation release the hold only when both are done", async () => {
  const first = pendingTurn();
  const second = pendingTurn();
  holdConversationTurn("two", first.promise);
  holdConversationTurn("two", second.promise);

  first.settle();
  await first.promise;
  await Promise.resolve();
  expect(conversationCommandBusy("two")).toBe(true);

  second.settle();
  await second.promise;
  await Promise.resolve();
  expect(conversationCommandBusy("two")).toBe(false);
});

test("a turn that rejects still releases its hold, and says so", async () => {
  // `runTurn` settles rather than rejecting, so a rejection is a runtime bug —
  // but a conversation wedged against every future command would be worse.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  holdConversationTurn("broken", Promise.reject(new Error("boom")));
  await Promise.resolve();
  await Promise.resolve();

  expect(conversationCommandBusy("broken")).toBe(false);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("rejected instead of settling"),
    "boom",
  );
  warn.mockRestore();
});

test("a command in flight is refused to turns and to other commands alike", () => {
  const settle = beginConversationCommand("running");

  expect(conversationCommandInFlight("running")).toBe(true);
  expect(conversationCommandBusy("running")).toBe(true);

  settle();
  expect(conversationCommandInFlight("running")).toBe(false);
  expect(conversationCommandBusy("running")).toBe(false);
});

test("holds are per conversation — one chat never blocks another", () => {
  const turn = pendingTurn();
  holdConversationTurn("mine", turn.promise);
  const settle = beginConversationCommand("mine");

  expect(conversationCommandBusy("yours")).toBe(false);
  expect(conversationCommandInFlight("yours")).toBe(false);
  settle();
});

test("a queued turn the route never saw still blocks a command", () => {
  // The session cache's own counter: a turn parked on the workdir lock is not
  // "running" on the bus yet, and its route hold may already have settled.
  cache.pending = 1;
  expect(conversationCommandBusy("queued")).toBe(true);
  cache.pending = 0;
});
