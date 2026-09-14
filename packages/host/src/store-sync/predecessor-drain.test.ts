import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import {
  DRAIN_STAMP_FILE,
  drainStampPath,
  readDrainStampFile,
} from "./drain-stamp";
import {
  publishDrainStamp,
  retireDrainStamp,
  waitForPredecessorDrain,
} from "./predecessor-drain";

function setup() {
  const remoteRoot = mkdtempSync(join(tmpdir(), "drain-wait-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "drain-wait-local-"));
  const logs: Array<{ message: string; err?: unknown }> = [];
  return {
    localRoot,
    log: (message: string, err?: unknown) => logs.push({ message, err }),
    logs,
    remoteRoot,
    store: new LocalDirStore(remoteRoot),
  };
}

/** A clock and a sleep that only ever move when the wait asks them to. */
function clock(startMs = 10_000) {
  let nowMs = startMs;
  const slept: number[] = [];
  return {
    now: () => nowMs,
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      nowMs += ms;
    },
  };
}

function publishRemote(remoteRoot: string, stamp: object) {
  writeFileSync(join(remoteRoot, DRAIN_STAMP_FILE), JSON.stringify(stamp));
}

test("no stamp: the boot hydrates at once and says nothing", async () => {
  const { store, log, logs } = setup();
  const time = clock();
  await waitForPredecessorDrain({ store, log, ...time });
  expect(logs).toEqual([]);
  expect(time.slept).toEqual([]);
});

test("an expired stamp is ignored", async () => {
  const { store, remoteRoot, log, logs } = setup();
  const time = clock();
  publishRemote(remoteRoot, { since: 0, until: time.now() - 1 });
  await waitForPredecessorDrain({ store, log, ...time });
  expect(time.slept).toEqual([]);
  expect(logs).toEqual([
    { message: "[local-host] drain stamp has already expired; hydrating now" },
  ]);
});

test("a malformed stamp is ignored", async () => {
  const { store, remoteRoot, log, logs } = setup();
  const time = clock();
  writeFileSync(join(remoteRoot, DRAIN_STAMP_FILE), "{ truncated");
  await waitForPredecessorDrain({ store, log, ...time });
  expect(time.slept).toEqual([]);
  expect(logs).toEqual([
    { message: "[local-host] drain stamp is unreadable; hydrating now" },
  ]);
});

test("polls until the predecessor's final sync removes the stamp", async () => {
  const { store, remoteRoot, log, logs } = setup();
  const time = clock();
  publishRemote(remoteRoot, { since: time.now(), until: time.now() + 60_000 });
  let polls = 0;
  await waitForPredecessorDrain({
    store,
    log,
    now: time.now,
    pollMs: 10_000,
    sleep: async (ms) => {
      await time.sleep(ms);
      // The predecessor finished its turn on the third poll.
      if (++polls === 3) rmSync(join(remoteRoot, DRAIN_STAMP_FILE));
    },
  });
  expect(time.slept).toEqual([10_000, 10_000, 10_000]);
  expect(logs[0]?.message).toBe(
    "[local-host] predecessor pod is still draining a turn; waiting up to 60s before hydrating",
  );
  expect(logs).toHaveLength(1);
});

test("a predecessor killed at its deadline stops the wait at `until`", async () => {
  const { store, remoteRoot, log, logs } = setup();
  const time = clock();
  publishRemote(remoteRoot, { since: time.now(), until: time.now() + 25_000 });
  await waitForPredecessorDrain({
    store,
    log,
    now: time.now,
    pollMs: 10_000,
    sleep: time.sleep,
  });
  // The last poll is trimmed to the deadline, never slept past it.
  expect(time.slept).toEqual([10_000, 10_000, 5_000]);
  expect(logs.at(-1)).toEqual({
    message: "[local-host] predecessor drain window elapsed; hydrating now",
  });
});

test("a download failure that is not 'absent' is reported and the boot proceeds", async () => {
  const { log, logs } = setup();
  const time = clock();
  const failure = new Error("connection reset");
  const store: ObjectStore = {
    list: async () => [],
    download: async () => {
      throw failure;
    },
    upload: async () => {},
    delete: async () => {},
  };
  await waitForPredecessorDrain({ store, log, ...time });
  expect(time.slept).toEqual([]);
  expect(logs).toEqual([
    {
      message:
        "[local-host] could not read the predecessor drain stamp; hydrating now",
      err: failure,
    },
  ]);
});

test("publishing stamps the window locally and flushes it to the store", async () => {
  const { localRoot, log, logs } = setup();
  let flushes = 0;
  await publishDrainStamp({
    rootDir: localRoot,
    windowMs: 485_000,
    flush: async () => {
      flushes += 1;
    },
    log,
    now: () => 1_000,
  });
  expect(flushes).toBe(1);
  expect(existsSync(drainStampPath(localRoot))).toBe(true);
  expect(logs).toEqual([]);
});

test("a failed flush never blocks the shutdown, and reports", async () => {
  const { localRoot, log, logs } = setup();
  const failure = new Error("store unreachable");
  await publishDrainStamp({
    rootDir: localRoot,
    windowMs: 1_000,
    flush: () => Promise.reject(failure),
    log,
  });
  expect(logs).toEqual([
    {
      message:
        "[local-host] could not publish the drain stamp; a replacement pod may settle this turn mid-drain",
      err: failure,
    },
  ]);
});

test("retiring closes the window in place so the final sync ships it", async () => {
  const { localRoot, log, logs } = setup();
  writeFileSync(
    drainStampPath(localRoot),
    JSON.stringify({ since: 1, until: 500_000 }),
  );
  await retireDrainStamp(localRoot, log, () => 42_000);
  expect(await readDrainStampFile(drainStampPath(localRoot))).toEqual({
    since: 1,
    until: 42_000,
  });
  expect(logs).toEqual([]);
});

test("a slow flush is not waited on past the cap", async () => {
  const { localRoot, log, logs } = setup();
  let release: () => void = () => {};
  const flush = new Promise<void>((resolve) => {
    release = resolve;
  });
  await publishDrainStamp({
    rootDir: localRoot,
    windowMs: 1_000,
    flush: () => flush,
    log,
    flushWaitMs: 5,
  });
  expect(logs.map((l) => l.message)).toEqual([
    "[local-host] drain stamp flush still in flight; continuing the drain without waiting for it",
  ]);
  release();
});
