import { expect, test } from "vitest";
import { ScopeStore } from "../../store";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

/**
 * The conversation VM cache is LRU-bounded so a long-lived client's memory
 * tracks its ACTIVE window, not total message volume. These pin the guarantees:
 * an idle conversation past the bound is evicted AND its retained snapshot
 * cleared; a live/streaming/queued or actively-subscribed conversation is never
 * evicted; `forget` is an explicit drop; and an evicted conversation re-hydrates
 * from history (authoritative) on re-seed.
 */

const frame = (text: string) => ({ feed_type: "assistant_text", data: text });
const snap = (store: ScopeStore, agent: string, key: string) =>
  store.getSnapshot(conversationScope(agent, key)) as
    | ConversationVM
    | undefined;

test("an idle conversation past the cache bound is evicted and its snapshot cleared", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 2 });

  vm.seedHistory("a", "c1", [frame("one")]);
  vm.seedHistory("a", "c2", [frame("two")]);
  vm.seedHistory("a", "c3", [frame("three")]); // over cap -> c1 (oldest, idle) out

  // The evicted conversation's snapshot — a full copy of its feed — is released,
  // not left dangling in the store. c2/c3 stay hot.
  expect(snap(store, "a", "c1")).toBeUndefined();
  expect(snap(store, "a", "c2")?.feed).toHaveLength(1);
  expect(snap(store, "a", "c3")?.feed).toHaveLength(1);
});

test("a RUNNING conversation is never evicted, even as the least-recently-used", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  vm.sessionStatus("a", "c1", "running"); // c1 is now live -> pinned
  vm.seedHistory("a", "c2", [frame("yo")]); // would evict c1 by age, but it's live

  // Live state is retained past the size bound rather than silently dropped.
  expect(snap(store, "a", "c1")?.running).toBe(true);
  expect(snap(store, "a", "c2")).toBeDefined();
});

test("a conversation with a queued message is not evicted", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  vm.setQueued("a", "c1", [{ id: "q1", text: "later" }]); // queued -> pinned
  vm.seedHistory("a", "c2", [frame("yo")]);

  expect(snap(store, "a", "c1")?.queued).toHaveLength(1);
});

test("an actively-subscribed conversation is not evicted (a viewed chat stays)", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  const unsub = store.subscribe(conversationScope("a", "c1"), () => {});
  vm.seedHistory("a", "c2", [frame("yo")]); // c1 is idle but subscribed -> pinned

  expect(snap(store, "a", "c1")?.feed).toHaveLength(1);
  unsub();
});

test("forget drops a conversation's folded state and its retained snapshot", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 50 });

  vm.seedHistory("a", "c1", [frame("one"), frame("two")]);
  expect(snap(store, "a", "c1")?.feed).toHaveLength(2);

  vm.forget("a", "c1");
  expect(snap(store, "a", "c1")).toBeUndefined();
});

test("an evicted conversation re-hydrates from history on re-seed (behavior-preserving)", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("one"), frame("two")]);
  vm.seedHistory("a", "c2", [frame("other")]); // evicts idle c1
  expect(snap(store, "a", "c1")).toBeUndefined();

  // Re-opening the conversation (observe -> seedHistory) rebuilds it whole from
  // authoritative history — the transcript is not lost, just re-loaded.
  vm.seedHistory("a", "c1", [frame("one"), frame("two")]);
  const feed = snap(store, "a", "c1")?.feed;
  expect(feed).toHaveLength(2);
  expect(feed?.map((f) => f.data)).toEqual(["one", "two"]);
});
