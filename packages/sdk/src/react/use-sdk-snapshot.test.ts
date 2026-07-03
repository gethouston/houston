import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HoustonSdk } from "../sdk";
import { ScopeStore } from "../store";
import { snapshotStoreAdapter, useSdkSnapshot } from "./use-sdk-snapshot";

/** A HoustonSdk stand-in backed by a real ScopeStore (read side only). */
function fakeSdk(): { store: ScopeStore; sdk: HoustonSdk } {
  const store = new ScopeStore();
  const sdk = {
    subscribe: (scope: string, cb: (s: unknown) => void) =>
      store.subscribe(scope, cb),
    getSnapshot: (scope: string) => store.getSnapshot(scope),
  } as unknown as HoustonSdk;
  return { store, sdk };
}

describe("snapshotStoreAdapter", () => {
  it("reads undefined before publish, then the latest snapshot", () => {
    const store = new ScopeStore();
    const adapter = snapshotStoreAdapter<{ n: number }>(store, "agents");
    expect(adapter.getSnapshot()).toBeUndefined();
    store.publish("agents", { n: 1 });
    expect(adapter.getSnapshot()).toEqual({ n: 1 });
  });

  it("returns the identical reference until a new snapshot is published", () => {
    const store = new ScopeStore();
    const adapter = snapshotStoreAdapter<{ n: number }>(store, "agents");
    const first = { n: 1 };
    store.publish("agents", first);
    expect(adapter.getSnapshot()).toBe(first);
    expect(adapter.getSnapshot()).toBe(first);
    const second = { n: 2 };
    store.publish("agents", second);
    expect(adapter.getSnapshot()).toBe(second);
  });

  it("notifies React's zero-arg callback on every publish to the scope", () => {
    const store = new ScopeStore();
    const adapter = snapshotStoreAdapter(store, "connection");
    const onStoreChange = vi.fn();
    const unsubscribe = adapter.subscribe(onStoreChange);

    store.publish("connection", { online: true });
    store.publish("connection", { online: false });
    expect(onStoreChange).toHaveBeenCalledTimes(2);

    // A publish to an unrelated scope must not wake this subscriber.
    store.publish("agents", []);
    expect(onStoreChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.publish("connection", { online: true });
    expect(onStoreChange).toHaveBeenCalledTimes(2);
  });
});

describe("useSdkSnapshot (server render)", () => {
  it("renders undefined for an unpublished scope", () => {
    const { sdk } = fakeSdk();
    const html = renderToStaticMarkup(
      createElement(SnapshotProbe, { sdk, scope: "agents" }),
    );
    expect(html).toBe("<output>none</output>");
  });

  it("renders the current snapshot without subscribing on the server", () => {
    const { store, sdk } = fakeSdk();
    store.publish("agents", { n: 7 });
    const html = renderToStaticMarkup(
      createElement(SnapshotProbe, { sdk, scope: "agents" }),
    );
    expect(html).toBe("<output>7</output>");
    // getServerSnapshot must not register a live subscriber; a later publish
    // has nothing to notify.
    const onChange = vi.fn();
    store.subscribe("agents", onChange);
    store.publish("agents", { n: 8 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

function SnapshotProbe({ sdk, scope }: { sdk: HoustonSdk; scope: string }) {
  const snapshot = useSdkSnapshot<{ n: number }>(sdk, scope);
  return createElement("output", null, snapshot ? String(snapshot.n) : "none");
}
