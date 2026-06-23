import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { installParentWatchdog } from "./parent-watchdog";

/**
 * The Unix orphan-prevention watchdog: when the supervising app force-quits it
 * sends no signal, only closes our stdin pipe (EOF). The host must catch that
 * and tear down (killing every runtime), then exit. It must stay inert under a
 * TTY (interactive `bun run`, self-host) where there is no supervisor to watch.
 */

/** A minimal stdin double: an EventEmitter we can fire 'end'/'close' on. */
function fakeStdin(isTTY: boolean) {
  const s = new EventEmitter() as unknown as NodeJS.ReadStream & {
    resumed: boolean;
  };
  s.isTTY = isTTY;
  s.resumed = false;
  (s as unknown as { resume: () => void }).resume = () => {
    s.resumed = true;
  };
  return s;
}

test("arms under a pipe (non-TTY): stdin EOF tears down and exits 0", async () => {
  const stdin = fakeStdin(false);
  const exits: number[] = [];
  let teardowns = 0;
  const armed = installParentWatchdog({
    stdin,
    onParentExit: () => {
      teardowns++;
    },
    exit: (c) => exits.push(c),
    log: () => {},
  });
  expect(armed).toBe(true);
  expect(stdin.resumed).toBe(true); // flowing so 'end' can fire

  stdin.emit("end"); // app force-quit closed the pipe
  await new Promise((r) => setTimeout(r, 0)); // let the async teardown settle
  expect(teardowns).toBe(1);
  expect(exits).toEqual([0]);
});

test("does NOT arm under a TTY (no supervisor pipe to watch)", () => {
  const stdin = fakeStdin(true);
  let teardowns = 0;
  const armed = installParentWatchdog({
    stdin,
    onParentExit: () => {
      teardowns++;
    },
    exit: () => {},
    log: () => {},
  });
  expect(armed).toBe(false);
  expect(stdin.resumed).toBe(false);
  stdin.emit("end"); // ignored — not watching
  expect(teardowns).toBe(0);
});

test("tears down only once even if end + close both fire", async () => {
  const stdin = fakeStdin(false);
  const exits: number[] = [];
  let teardowns = 0;
  installParentWatchdog({
    stdin,
    onParentExit: () => {
      teardowns++;
    },
    exit: (c) => exits.push(c),
    log: () => {},
  });
  stdin.emit("end");
  stdin.emit("close");
  await new Promise((r) => setTimeout(r, 0));
  expect(teardowns).toBe(1);
  expect(exits).toEqual([0]);
});

test("a failing teardown still exits (loudly logged, never swallowed)", async () => {
  const stdin = fakeStdin(false);
  const exits: number[] = [];
  const logs: string[] = [];
  installParentWatchdog({
    stdin,
    onParentExit: () => {
      throw new Error("kill failed");
    },
    exit: (c) => exits.push(c),
    log: (m) => logs.push(m),
  });
  stdin.emit("end");
  await new Promise((r) => setTimeout(r, 0));
  expect(exits).toEqual([0]); // we still exit so we don't hang as an orphan
  expect(logs.some((l) => l.includes("kill failed"))).toBe(true); // surfaced
});
