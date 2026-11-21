import { expect, test, vi } from "vitest";

const { streamGlobalEvents } = vi.hoisted(() => ({
  streamGlobalEvents: vi.fn(),
}));
vi.mock("@houston/runtime-client", () => ({ streamGlobalEvents }));
vi.mock("@houston/engine-adapter/session-refresh", () => ({
  refreshLiveToken: vi.fn(),
}));

import { subscribeEvents } from "@houston/engine-adapter/cp/events";

let gateways = 0;
function freshGateway() {
  gateways += 1;
  return { baseUrl: `https://gateway-${gateways}.example`, token: "t" };
}

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

  opts.onConnect?.();
  opts.onConnect?.();
  opts.onConnect?.();

  expect(events).toEqual([
    { type: "EventStreamReconnected" },
    { type: "EventStreamReconnected" },
  ]);
  stop();
});

test("a RE-subscription to the same gateway publishes the catch-up event", () => {
  const first = subscribe();
  first.opts.onConnect?.();
  first.stop();

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

test("a DOM-less host registers nothing instead of crashing", () => {
  const { opts, stop } = subscribe();
  const wake = (opts as { wake?: (retry: () => void) => () => void }).wake;

  expect(() => wake?.(() => {})?.()).not.toThrow();
  stop();
});
