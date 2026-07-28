import { expect, test, vi } from "vitest";

/**
 * HOU-981, the lost-events half.
 *
 * `streamGlobalEvents` has always exposed an `onConnect` seam — documented as
 * the reconnect catch-up hook — and the adapter never passed it. The `/v1/events`
 * feed carries no replay cursor, so everything emitted while the stream was
 * down (a routine finishing overnight, a teammate's mission) was lost for good,
 * and nothing re-read the cross-agent aggregate afterwards.
 *
 * The adapter now publishes a transport event on RE-connect and lets the app's
 * invalidation plan decide what to re-read. The first connect is deliberately
 * silent: its read is already in flight.
 */

const { streamGlobalEvents } = vi.hoisted(() => ({
  streamGlobalEvents: vi.fn(),
}));
vi.mock("@houston/runtime-client", () => ({ streamGlobalEvents }));
vi.mock("../src/engine-adapter/session-refresh", () => ({
  refreshLiveToken: vi.fn(),
}));

import { subscribeEvents } from "../src/engine-adapter/cp/events";

const CFG = { baseUrl: "https://gateway.example", token: "t" };

/** Subscribe and hand back the loop options the adapter passed in. */
function subscribe() {
  const events: unknown[] = [];
  streamGlobalEvents.mockClear();
  const stop = subscribeEvents(CFG, (e) => events.push(e));
  const opts = streamGlobalEvents.mock.calls[0][0] as {
    onConnect?: () => void;
  };
  return { events, opts, stop };
}

test("the first connect publishes nothing — the initial read is already running", () => {
  const { events, opts, stop } = subscribe();

  opts.onConnect?.();

  expect(events).toEqual([]);
  stop();
});

test("every RE-connect publishes the catch-up event", () => {
  const { events, opts, stop } = subscribe();

  opts.onConnect?.(); // initial
  opts.onConnect?.(); // recovered from a drop
  opts.onConnect?.(); // and another

  expect(events).toEqual([
    { type: "EventStreamReconnected" },
    { type: "EventStreamReconnected" },
  ]);
  stop();
});

test("the catch-up seam is wired at all — the regression that started this", () => {
  const { opts, stop } = subscribe();

  expect(typeof opts.onConnect).toBe("function");
  stop();
});
