import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ONE Playwright suite per machine.
 *
 * A suite saturates the box by design (N workers × a full Chromium each), so
 * two running at once — trivially common with parallel agent worktrees — starve
 * each other into mass visibility timeouts that read as product failures.
 * Serializing at the machine level costs queue minutes in the review phase
 * (where wall time is cheap) and buys every other session a usable machine.
 *
 * Mechanics: an atomic `mkdir` in the OS tmpdir is the lock; the holder's pid
 * inside lets waiters steal from a dead process. Waiting is capped — on
 * timeout we RUN rather than deadlock, loudly, because a wedged-but-alive
 * holder must never brick every worktree's review gate.
 */

const LOCK_DIR = path.join(os.tmpdir(), "houston-e2e-suite.lock");
const PID_FILE = path.join(LOCK_DIR, "pid");
const POLL_MS = 5_000;
const REPORT_EVERY_MS = 30_000;
const MAX_WAIT_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function holderPid(): number | undefined {
  try {
    const pid = Number(readFileSync(PID_FILE, "utf8"));
    return Number.isFinite(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = alive but not ours; anything else = gone.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function acquireSuiteLock(): Promise<void> {
  const started = Date.now();
  let lastReport = 0;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      writeFileSync(PID_FILE, String(process.pid));
      return;
    } catch {
      const pid = holderPid();
      if (pid !== undefined && !processAlive(pid)) {
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }
      const waited = Date.now() - started;
      if (waited > MAX_WAIT_MS) {
        console.warn(
          `[e2e-lock] waited ${Math.round(waited / 60_000)}m for pid ${pid}; running anyway — expect contention.`,
        );
        return;
      }
      if (waited - lastReport >= REPORT_EVERY_MS) {
        lastReport = waited;
        console.log(
          `[e2e-lock] another suite is running (pid ${pid ?? "?"}); waiting…`,
        );
      }
      await sleep(POLL_MS);
    }
  }
}

/** Release only OUR lock: a timed-out waiter that ran unlocked must not free
 *  the legitimate holder's. */
export function releaseSuiteLock(): void {
  if (holderPid() === process.pid)
    rmSync(LOCK_DIR, { recursive: true, force: true });
}
