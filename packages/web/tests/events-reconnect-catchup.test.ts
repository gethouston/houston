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

/**
 * "Has this feed ever streamed?" is remembered per GATEWAY for the page's
 * lifetime, so every test that wants to act like a fresh boot must name its own
 * gateway. Two subscriptions to the SAME gateway are what a token refresh or a
 * `setEndpoint` does, and that is the case the second half of this file pins.
 */
let gateways = 0;
function freshGateway() {
  gateways += 1;
  return { baseUrl: `https://gateway-${gateways}.example`, token: "t" };
}

/** Subscribe and hand back the loop options the adapter passed in. */
function subscribe(cfg: { baseUrl: string; token: string } = freshGateway()) {
  const events: unknown[] = [];
  streamGlobalEvents.mockClear();
  const stop = subscribeEvents(cfg, (e) => events.push(e));
  const opts = streamGlobalEvents.mock.calls[0][0] as {
    onConnect?: () => void;
  };
  return { cfg, events, opts, stop };
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

/**
 * The laptop-asleep case, and the one that loses the MOST events.
 *
 * A 401 on the stream refreshes the session, and `setHostedEngineSessionToken`
 * tears the whole client down and rebuilds it (`_ws.disconnect()` then
 * `_ws.connect()`) — a brand-new `subscribeEvents` call. When the "have we
 * connected before" flag lived in that call's closure it restarted at zero, so
 * the reconnect that follows the longest gap was the one reconnect that stayed
 * silent and nothing re-read the board.
 */
test("a RE-subscription to the same gateway publishes the catch-up event", () => {
  const first = subscribe();
  first.opts.onConnect?.();
  first.stop();

  // Same gateway, new subscription: the token was refreshed under us.
  const second = subscribe(first.cfg);
  second.opts.onConnect?.();

  expect(second.events).toEqual([{ type: "EventStreamReconnected" }]);
  second.stop();
});

test("a different gateway starts silent — a real fresh boot is not a reconnect", () => {
  const first = subscribe();
  first.opts.onConnect?.();
  first.stop();

  const other = subscribe();
  other.opts.onConnect?.();

  expect(other.events).toEqual([]);
  other.stop();
});

test("the catch-up seam is wired at all — the regression that started this", () => {
  const { opts, stop } = subscribe();

  expect(typeof opts.onConnect).toBe("function");
  stop();
});
