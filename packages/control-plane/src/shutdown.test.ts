import { test, expect } from "bun:test";
import { installGracefulShutdown } from "./shutdown";

/**
 * The drain semantics zero-downtime deploys depend on: stop accepting, finish
 * in-flight, force-exit when long-lived SSE streams would otherwise hold the
 * process open, and never double-close on a second signal.
 */

function fakeServer() {
  const calls = { close: 0, closeIdle: 0 };
  let finishClose: (() => void) | null = null;
  return {
    calls,
    finish: () => finishClose?.(),
    server: {
      close(cb?: (err?: Error) => void) {
        calls.close++;
        finishClose = () => cb?.();
        return this as never;
      },
      closeIdleConnections() {
        calls.closeIdle++;
      },
    },
  };
}

test("drains cleanly: close + idle-close, exits 0 when in-flight work finishes", () => {
  const { server, calls, finish } = fakeServer();
  const exits: number[] = [];
  const drain = installGracefulShutdown(server, {
    graceMs: 5_000,
    log: () => {},
    exit: (c) => exits.push(c),
  });
  drain("SIGTERM");
  expect(calls.close).toBe(1);
  expect(calls.closeIdle).toBe(1);
  expect(exits).toEqual([]); // still draining
  finish();
  expect(exits).toEqual([0]);
});

test("a second signal is a no-op (no double close)", () => {
  const { server, calls } = fakeServer();
  const drain = installGracefulShutdown(server, { graceMs: 5_000, log: () => {}, exit: () => {} });
  drain("SIGTERM");
  drain("SIGINT");
  expect(calls.close).toBe(1);
});

test("force-exits after the grace window when streams never end", async () => {
  const { server } = fakeServer(); // close() callback never fires
  const exits: number[] = [];
  const drain = installGracefulShutdown(server, {
    graceMs: 30,
    log: () => {},
    exit: (c) => exits.push(c),
  });
  drain("SIGTERM");
  expect(exits).toEqual([]);
  await new Promise((r) => setTimeout(r, 60));
  expect(exits).toEqual([0]);
});
