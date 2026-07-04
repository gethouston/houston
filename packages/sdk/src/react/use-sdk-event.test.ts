import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HoustonSdk } from "../sdk";
import { ScopeStore, type SdkEvent } from "../store";
import {
  type EventSource,
  subscribeToEvent,
  useSdkEvent,
} from "./use-sdk-event";

/**
 * Adapt a ScopeStore to the SDK's event surface: the SDK exposes `on`, the
 * store exposes `onEvent`.
 */
function eventSource(store: ScopeStore): EventSource {
  return { on: (cb) => store.onEvent(cb) };
}

/** A HoustonSdk stand-in backed by a real ScopeStore (event channel only). */
function fakeSdk(): { store: ScopeStore; sdk: HoustonSdk } {
  const store = new ScopeStore();
  const sdk = eventSource(store) as unknown as HoustonSdk;
  return { store, sdk };
}

describe("subscribeToEvent", () => {
  it("invokes the handler only for the matching event type", () => {
    const store = new ScopeStore();
    const handler = vi.fn();
    subscribeToEvent(eventSource(store), "turn/started", () => handler);

    const started: SdkEvent = { type: "turn/started", data: { id: "t1" } };
    store.emitEvent(started);
    store.emitEvent({ type: "turn/finished" });
    store.emitEvent(started);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(started);
  });

  it("reads the handler per event, so a swapped closure takes effect", () => {
    const store = new ScopeStore();
    const first = vi.fn();
    const second = vi.fn();
    let current = first;
    subscribeToEvent(eventSource(store), "connection/error", () => current);

    store.emitEvent({ type: "connection/error" });
    current = second;
    store.emitEvent({ type: "connection/error" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const store = new ScopeStore();
    const handler = vi.fn();
    const unsubscribe = subscribeToEvent(
      eventSource(store),
      "turn/started",
      () => handler,
    );

    store.emitEvent({ type: "turn/started" });
    unsubscribe();
    store.emitEvent({ type: "turn/started" });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("useSdkEvent (server render)", () => {
  it("renders without subscribing on the server (effects do not run)", () => {
    const { store, sdk } = fakeSdk();
    const handler = vi.fn();
    const html = renderToStaticMarkup(
      createElement(EventProbe, { sdk, type: "turn/started", handler }),
    );
    expect(html).toBe("<output>ok</output>");

    // The subscription lives in a useEffect, which server rendering skips, so
    // an event emitted server-side reaches no one.
    store.emitEvent({ type: "turn/started" });
    expect(handler).not.toHaveBeenCalled();
  });
});

function EventProbe({
  sdk,
  type,
  handler,
}: {
  sdk: HoustonSdk;
  type: string;
  handler: (event: SdkEvent) => void;
}) {
  useSdkEvent(sdk, type, handler);
  return createElement("output", null, "ok");
}
