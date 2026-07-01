import { EventEmitter } from "node:events";
import { expect, test } from "vitest";
import { installParentWatchdog } from "./parent-watchdog";

/**
 * The Unix orphan-prevention watchdog: when the supervising app force-quits it
 * sends no signal, only closes our stdin pipe (EOF). The host must catch that
 * and tear down (killing every runtime), then exit. It must arm ONLY when the
 * supervisor flagged us with `HOUSTON_SUPERVISED=1`; everything else (self-host
 * Docker, plain `tsx`, tests) leaves it unset, so a closed/`/dev/null` stdin
 * never trips it (HOU-582).
 */

/** A minimal stdin double: an EventEmitter we can fire 'end'/'close' on. */
function fakeStdin() {
  const s = new EventEmitter() as unknown as NodeJS.ReadStream & {
    resumed: boolean;
  };
  s.resumed = false;
  (s as unknown as { resume: () => void }).resume = () => {
    s.resumed = true;
  };
  return s;
}

test("arms when supervised: stdin EOF tears down and exits 0", async () => {
  const stdin = fakeStdin();
  const exits: number[] = [];
  let teardowns = 0;
  const armed = installParentWatchdog({
    stdin,
    supervised: true,
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

test("HOU-582: does NOT arm when unsupervised (self-host Docker /dev/null stdin)", () => {
  // The regression. Docker `tsx` gives a non-TTY, immediately
  // closed stdin and never sets HOUSTON_SUPERVISED. The old `!isTTY` gate armed
  // here and crash-looped at boot; the supervised gate must stay inert.
  const stdin = fakeStdin();
  let teardowns = 0;
  const armed = installParentWatchdog({
    stdin,
    supervised: false,
    onParentExit: () => {
      teardowns++;
    },
    exit: () => {},
    log: () => {},
  });
  expect(armed).toBe(false);
  expect(stdin.resumed).toBe(false); // never put in flowing mode
  stdin.emit("end"); // the immediate /dev/null EOF — must be ignored
  stdin.emit("close");
  expect(teardowns).toBe(0); // host stays up, no crash loop
});

test("tears down only once even if end + close both fire", async () => {
  const stdin = fakeStdin();
  const exits: number[] = [];
  let teardowns = 0;
  installParentWatchdog({
    stdin,
    supervised: true,
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
  const stdin = fakeStdin();
  const exits: number[] = [];
  const logs: string[] = [];
  installParentWatchdog({
    stdin,
    supervised: true,
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
