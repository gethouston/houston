import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ObjectNotFoundError,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import {
  DRAIN_STAMP_FILE,
  type DrainStamp,
  expireDrainStamp,
  readDrainStampFile,
  writeDrainStamp,
} from "./drain-stamp";

export const DRAIN_WAIT_POLL_MS = 10_000;
export const DRAIN_WAIT_MAX_MS = 600_000;
export const DRAIN_STAMP_FLUSH_WAIT_MS = 20_000;

type Log = (message: string, err?: unknown) => void;

export interface PublishDrainStampOptions {
  rootDir: string;
  windowMs: number;
  flush: () => Promise<void>;
  log: Log;
  now?: () => number;
  flushWaitMs?: number;
}

export async function publishDrainStamp(
  opts: PublishDrainStampOptions,
): Promise<void> {
  const since = (opts.now ?? Date.now)();
  const report = (err: unknown) =>
    opts.log(
      "[local-host] could not publish the drain stamp; a replacement pod may settle this turn mid-drain",
      err,
    );
  try {
    await writeDrainStamp(opts.rootDir, {
      since,
      until: since + opts.windowMs,
    });
  } catch (err) {
    report(err);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<"timeout">((resolve) => {
    timer = setTimeout(
      () => resolve("timeout"),
      opts.flushWaitMs ?? DRAIN_STAMP_FLUSH_WAIT_MS,
    );
  });
  const flushed = opts
    .flush()
    .then(() => "flushed" as const)
    .catch((err: unknown) => {
      report(err);
      return "failed" as const;
    });
  const outcome = await Promise.race([flushed, capped]);
  if (timer) clearTimeout(timer);
  if (outcome === "timeout") {
    opts.log(
      "[local-host] drain stamp flush still in flight; continuing the drain without waiting for it",
    );
  }
}

export async function retireDrainStamp(
  rootDir: string,
  log: Log,
  now: () => number = Date.now,
): Promise<void> {
  try {
    await expireDrainStamp(rootDir, now());
  } catch (err) {
    log(
      "[local-host] could not expire the drain stamp; the next boot may wait its window out",
      err,
    );
  }
}

export interface PredecessorDrainWaitOptions {
  store: ObjectStore;
  log: Log;
  now?: () => number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

type RemoteStamp =
  | { kind: "absent" }
  | { kind: "malformed" }
  | { kind: "stamp"; stamp: DrainStamp };

async function readRemoteDrainStamp(
  store: ObjectStore,
  destFile: string,
): Promise<RemoteStamp> {
  try {
    try {
      await store.download(DRAIN_STAMP_FILE, destFile);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return { kind: "absent" };
      throw err;
    }
    const stamp = await readDrainStampFile(destFile);
    return stamp ? { kind: "stamp", stamp } : { kind: "malformed" };
  } finally {
    await rm(destFile, { force: true });
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function waitForPredecessorDrain(
  opts: PredecessorDrainWaitOptions,
): Promise<void> {
  const now = opts.now ?? (() => Date.now());
  const pollMs = opts.pollMs ?? DRAIN_WAIT_POLL_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const destFile = join(tmpdir(), `houston-drain-stamp-${process.pid}.json`);
  try {
    const first = await readRemoteDrainStamp(opts.store, destFile);
    if (first.kind === "absent") return;
    if (first.kind === "malformed") {
      opts.log("[local-host] drain stamp is unreadable; hydrating now");
      return;
    }
    let deadline = Math.min(first.stamp.until, now() + DRAIN_WAIT_MAX_MS);
    if (deadline <= now()) {
      opts.log("[local-host] drain stamp has already expired; hydrating now");
      return;
    }
    opts.log(
      `[local-host] predecessor pod is still draining a turn; waiting up to ${Math.ceil(
        (deadline - now()) / 1000,
      )}s before hydrating`,
    );
    while (now() < deadline) {
      await sleep(Math.min(pollMs, deadline - now()));
      const next = await readRemoteDrainStamp(opts.store, destFile);
      if (next.kind !== "stamp") return;
      deadline = Math.min(next.stamp.until, deadline);
    }
    opts.log("[local-host] predecessor drain window elapsed; hydrating now");
  } catch (err) {
    opts.log(
      "[local-host] could not read the predecessor drain stamp; hydrating now",
      err,
    );
  }
}
