import { describe, expect, it, vi } from "vitest";
import { ScopeStore, type SdkEvent } from "./store";

describe("ScopeStore snapshots", () => {
  it("returns undefined for an unpublished scope, then the latest value", () => {
    const store = new ScopeStore();
    expect(store.getSnapshot("agents")).toBeUndefined();
    store.publish("agents", { count: 1 });
    expect(store.getSnapshot("agents")).toEqual({ count: 1 });
    store.publish("agents", { count: 2 });
    expect(store.getSnapshot("agents")).toEqual({ count: 2 });
  });

  it("notifies subscribers with the published snapshot", () => {
    const store = new ScopeStore();
    const cb = vi.fn();
    store.subscribe("conversation/a", cb);
    store.publish("conversation/a", { messages: [] });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ messages: [] });
  });

  it("scopes are isolated: a publish only notifies that scope", () => {
    const store = new ScopeStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe("connection", a);
    store.subscribe("agents", b);
    store.publish("connection", { status: "online" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("does not deliver the current snapshot on subscribe", () => {
    const store = new ScopeStore();
    store.publish("agents", { count: 1 });
    const cb = vi.fn();
    store.subscribe("agents", cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe (idempotent)", () => {
    const store = new ScopeStore();
    const cb = vi.fn();
    const off = store.subscribe("agents", cb);
    store.publish("agents", 1);
    off();
    off(); // idempotent
    store.publish("agents", 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers on one scope", () => {
    const store = new ScopeStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe("agents", a);
    store.subscribe("agents", b);
    store.publish("agents", "x");
    expect(a).toHaveBeenCalledWith("x");
    expect(b).toHaveBeenCalledWith("x");
  });
});

describe("ScopeStore re-entrancy", () => {
  it("a subscriber may unsubscribe itself during publish without crashing", () => {
    const store = new ScopeStore();
    const calls: string[] = [];
    let off = () => {};
    const selfRemoving = vi.fn(() => {
      calls.push("self");
      off();
    });
    off = store.subscribe("agents", selfRemoving);
    store.subscribe(
      "agents",
      vi.fn(() => calls.push("other")),
    );

    expect(() => store.publish("agents", 1)).not.toThrow();
    // Both were in the set snapshot at publish time.
    expect(calls).toEqual(["self", "other"]);

    // On the NEXT publish the self-removed subscriber is gone.
    calls.length = 0;
    store.publish("agents", 2);
    expect(calls).toEqual(["other"]);
    expect(selfRemoving).toHaveBeenCalledTimes(1);
  });

  it("a subscriber may unsubscribe ANOTHER during publish without crashing", () => {
    const store = new ScopeStore();
    const second = vi.fn();
    const offSecond = store.subscribe("agents", second);
    store.subscribe(
      "agents",
      vi.fn(() => offSecond()),
    );
    // `second` was added after the remover, so it is still in the snapshot; the
    // guarantee under test is that the removal does not throw mid-iteration.
    expect(() => store.publish("agents", 1)).not.toThrow();
  });

  it("a subscriber may add a new subscriber during publish", () => {
    const store = new ScopeStore();
    const late = vi.fn();
    store.subscribe(
      "agents",
      vi.fn(() => store.subscribe("agents", late)),
    );
    // Adding mid-publish must not throw; the late one is not called this round.
    expect(() => store.publish("agents", 1)).not.toThrow();
    expect(late).not.toHaveBeenCalled();
    store.publish("agents", 2);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe("ScopeStore events", () => {
  it("broadcasts events to all listeners and supports unsubscribe", () => {
    const store = new ScopeStore();
    const a = vi.fn();
    const b = vi.fn();
    store.onEvent(a);
    const offB = store.onEvent(b);
    const event: SdkEvent = { type: "turn/started", scope: "conversation/x" };
    store.emitEvent(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);

    offB();
    store.emitEvent({ type: "turn/ended" });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("an event listener may unsubscribe itself during emit without crashing", () => {
    const store = new ScopeStore();
    let off = () => {};
    const listener = vi.fn(() => off());
    off = store.onEvent(listener);
    expect(() => store.emitEvent({ type: "x" })).not.toThrow();
    store.emitEvent({ type: "y" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
