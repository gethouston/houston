import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  DRAIN_POLL_MS,
  DRAIN_SETTLE_MS,
  drainTurnsThenExit,
  type GracefulShutdownDeps,
} from "./graceful-shutdown";

function harness(overrides: Partial<GracefulShutdownDeps> = {}) {
  const server = { close: vi.fn() };
  const exit = vi.fn();
  const log = { info: vi.fn(), warn: vi.fn() };
  let running = true;
  const deps: GracefulShutdownDeps = {
    server,
    drainMs: 480_000,
    anyTurnRunning: () => running,
    exit,
    log,
    ...overrides,
  };
  return {
    deps,
    server,
    exit,
    log,
    endTurn: () => {
      running = false;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("a running turn holds the process: no close, no exit, for as long as it runs", () => {
  const h = harness();
  drainTurnsThenExit(h.deps);
  vi.advanceTimersByTime(60_000);
  expect(h.server.close).not.toHaveBeenCalled();
  expect(h.exit).not.toHaveBeenCalled();
  expect(h.log.info).toHaveBeenCalledWith(
    expect.stringContaining("holding in-flight turns"),
    { drainMs: 480_000 },
  );
});

test("once the last turn ends the listener closes and the process exits, once", () => {
  const h = harness();
  drainTurnsThenExit(h.deps);
  vi.advanceTimersByTime(10_000);
  h.endTurn();
  vi.advanceTimersByTime(DRAIN_POLL_MS + DRAIN_SETTLE_MS);
  expect(h.server.close).toHaveBeenCalledTimes(1);
  expect(h.exit).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60_000);
  expect(h.exit).toHaveBeenCalledTimes(1);
  expect(h.log.warn).not.toHaveBeenCalled();
});

test("an idle runtime leaves after the settle beat", () => {
  const h = harness();
  h.endTurn();
  drainTurnsThenExit(h.deps);
  expect(h.exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(DRAIN_SETTLE_MS);
  expect(h.server.close).toHaveBeenCalledTimes(1);
  expect(h.exit).toHaveBeenCalledTimes(1);
  expect(h.log.info).not.toHaveBeenCalled();
});

test("the drain budget is the hard stop: a turn still running at the deadline is abandoned with a warning", () => {
  const h = harness({ drainMs: 5_000 });
  drainTurnsThenExit(h.deps);
  vi.advanceTimersByTime(4_999);
  expect(h.exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(DRAIN_POLL_MS + DRAIN_SETTLE_MS);
  expect(h.exit).toHaveBeenCalledTimes(1);
  expect(h.log.warn).toHaveBeenCalledWith(
    expect.stringContaining("drain deadline reached"),
    { drainMs: 5_000 },
  );
});

test("the listener keeps answering while a turn drains (the host probes /busy through it)", async () => {
  vi.useRealTimers();
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ busy: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const url = `http://127.0.0.1:${address.port}/busy`;
  let running = true;
  const exit = vi.fn();
  drainTurnsThenExit({
    server,
    drainMs: 10_000,
    anyTurnRunning: () => running,
    exit,
    log: { info: () => {}, warn: () => {} },
  });
  // The pre-fix shape closed the listener at signal time; a probe here
  // would have been refused.
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ busy: true });
  expect(exit).not.toHaveBeenCalled();
  running = false;
  await vi.waitFor(() => expect(exit).toHaveBeenCalledTimes(1), {
    timeout: 5_000,
  });
  await expect(fetch(url)).rejects.toThrow();
});
