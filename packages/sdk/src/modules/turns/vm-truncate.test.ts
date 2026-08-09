import { expect, test } from "vitest";
import { ScopeStore } from "../../store";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

/**
 * The edit-and-resend rewind fold (PRODUCT-1217): `truncateFromTurn` drops the
 * feed tail from the edited user turn onward. Explicit — the history reseed
 * path deliberately skips shorter folds, so this fold is the ONLY thing that
 * can rewind an on-screen feed.
 */

const snap = (store: ScopeStore, agent: string, key: string) =>
  store.getSnapshot(conversationScope(agent, key)) as
    | ConversationVM
    | undefined;

const twoTurns = [
  { feed_type: "user_message", data: "Hi", turnId: "t1" },
  { feed_type: "assistant_text", data: "Hi, how can I help?", turnId: "t1" },
  { feed_type: "user_message", data: "tell me a story", turnId: "t2" },
  { feed_type: "assistant_text", data: "Once upon a time…", turnId: "t2" },
];

test("truncateFromTurn drops the edited turn and everything after; earlier turns stay", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  vm.seedHistory("a", "c1", twoTurns, { earliestLoaded: 0, total: 4 });

  expect(vm.truncateFromTurn("a", "c1", "t2")).toBe(true);

  const s = snap(store, "a", "c1");
  expect(s?.feed.map((f) => f.turnId)).toEqual(["t1", "t1"]);
  // The stale window stamp is dropped — the feed no longer maps to the last
  // read server window; the next authoritative read re-arms load-older.
  expect(s?.historyWindow).toBeUndefined();
});

test("truncating the FIRST turn empties the feed", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  vm.seedHistory("a", "c1", twoTurns);

  expect(vm.truncateFromTurn("a", "c1", "t1")).toBe(true);
  expect(snap(store, "a", "c1")?.feed).toEqual([]);
});

test("an unknown turn folds nothing and publishes nothing", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  vm.seedHistory("a", "c1", twoTurns);
  const before = snap(store, "a", "c1");

  expect(vm.truncateFromTurn("a", "c1", "ghost")).toBe(false);
  expect(snap(store, "a", "c1")).toBe(before);
});

test("a pending interaction settled by a dropped turn is cleared with it", async () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  vm.seedHistory("a", "c1", twoTurns);
  await vm.persistBoardStatus("a", "c1", "needs_you", {
    steps: [{ kind: "question", id: "q1", question: "which car?" }],
  });

  vm.truncateFromTurn("a", "c1", "t2");
  expect(snap(store, "a", "c1")?.pendingInteraction).toBeNull();
});
