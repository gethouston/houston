import { expect, test } from "vitest";
import { ScopeStore } from "../../store";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

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
  vm.seedHistory("a", "c3", [frame("three")]);

  expect(snap(store, "a", "c1")).toBeUndefined();
  expect(snap(store, "a", "c2")?.feed).toHaveLength(1);
  expect(snap(store, "a", "c3")?.feed).toHaveLength(1);
});

test("a RUNNING conversation is never evicted, even as the least-recently-used", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  vm.sessionStatus("a", "c1", "running");
  vm.seedHistory("a", "c2", [frame("yo")]);

  expect(snap(store, "a", "c1")?.running).toBe(true);
  expect(snap(store, "a", "c2")).toBeDefined();
});

test("a conversation with a queued message is not evicted", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  vm.setQueued("a", "c1", [{ id: "q1", text: "later" }]);
  vm.seedHistory("a", "c2", [frame("yo")]);

  expect(snap(store, "a", "c1")?.queued).toHaveLength(1);
});

test("an actively-subscribed conversation is not evicted (a viewed chat stays)", () => {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store, { cacheMax: 1 });

  vm.seedHistory("a", "c1", [frame("hi")]);
  const unsub = store.subscribe(conversationScope("a", "c1"), () => {});
  vm.seedHistory("a", "c2", [frame("yo")]);

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
  vm.seedHistory("a", "c2", [frame("other")]);
  expect(snap(store, "a", "c1")).toBeUndefined();

  vm.seedHistory("a", "c1", [frame("one"), frame("two")]);
  const feed = snap(store, "a", "c1")?.feed;
  expect(feed).toHaveLength(2);
  expect(feed?.map((f) => f.data)).toEqual(["one", "two"]);
});
