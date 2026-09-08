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

/**
 * The wake seam. A machine that slept through a host restart holds a socket
 * that is open on paper and dead in fact, and the loop would otherwise learn
 * that only from its deliberately slow idle watchdog. The adapter hands it the
 * platform's own recovery moments, so the user's first glance at the window is
 * already the trigger.
 */
type Listener = (ev: unknown) => void;

function fakeDomTarget(log: { added: string[]; removed: string[] }) {
  return {
    addEventListener: (type: string, _fn: Listener) => log.added.push(type),
    removeEventListener: (type: string, _fn: Listener) =>
      log.removed.push(type),
  };
}

test("the loop is given the platform's wake signals, and drops them on stop", () => {
  const log = { added: [] as string[], removed: [] as string[] };
  vi.stubGlobal("window", fakeDomTarget(log));
  vi.stubGlobal("document", {
    ...fakeDomTarget(log),
    visibilityState: "visible",
  });

  const { opts, stop } = subscribe();
  const teardown = (
    opts as { wake?: (retry: () => void) => () => void }
  ).wake?.(() => {});

  expect(log.added).toEqual(["online", "visibilitychange"]);
  teardown?.();
  expect(log.removed).toEqual(["online", "visibilitychange"]);

  stop();
  vi.unstubAllGlobals();
});

/** A host with no DOM (tests, a Node-side adapter) simply gets no wake. */
test("a DOM-less host registers nothing instead of crashing", () => {
  const { opts, stop } = subscribe();
  const wake = (opts as { wake?: (retry: () => void) => () => void }).wake;

  expect(() => wake?.(() => {})?.()).not.toThrow();
  stop();
});
