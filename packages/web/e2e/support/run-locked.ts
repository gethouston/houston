import { spawn } from "node:child_process";
import { acquireSuiteLock, releaseSuiteLock } from "./machine-lock";

/**
 * Run a full Playwright suite under the machine-wide one-suite lock.
 *
 * The lock must wrap the WHOLE `playwright test` process — not live in
 * globalSetup — because Playwright boots its webServers BEFORE globalSetup: a
 * queued run would adopt the running suite's live servers (reuseExistingServer)
 * and then lose them mid-run when the first suite finishes and tears its own
 * down. Wrapping the invocation means a queued run starts nothing until the
 * machine is truly free.
 *
 * Usage (package.json): `tsx e2e/support/run-locked.ts playwright test …`.
 * Scoped single-spec `pnpm exec playwright test <file>` runs bypass the lock
 * on purpose — they are light, and queueing them behind a full suite would
 * slow the fix loop for no protection worth having.
 */
async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error("run-locked: no command given");
    process.exit(2);
  }

  await acquireSuiteLock();

  const child = spawn(cmd, args, { stdio: "inherit" });
  const forward = (signal: NodeJS.Signals) =>
    process.on(signal, () => child.kill(signal));
  forward("SIGINT");
  forward("SIGTERM");

  child.on("exit", (code, signal) => {
    releaseSuiteLock();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    releaseSuiteLock();
    console.error(`run-locked: failed to start ${cmd}:`, err);
    process.exit(1);
  });
}

void main();
