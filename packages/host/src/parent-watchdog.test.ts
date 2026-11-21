import { EventEmitter } from "node:events";
import { expect, test } from "vitest";
import { installParentWatchdog } from "./parent-watchdog";

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
  expect(stdin.resumed).toBe(true);

  stdin.emit("end");
  await new Promise((r) => setTimeout(r, 0));
  expect(teardowns).toBe(1);
  expect(exits).toEqual([0]);
});

test("HOU-582: does NOT arm when unsupervised (self-host Docker /dev/null stdin)", () => {
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
  expect(stdin.resumed).toBe(false);
  stdin.emit("end");
  stdin.emit("close");
  expect(teardowns).toBe(0);
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
  expect(exits).toEqual([0]);
  expect(logs.some((l) => l.includes("kill failed"))).toBe(true);
});
