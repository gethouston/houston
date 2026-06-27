import { afterEach, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import type { Agent } from "../domain/types";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
  type SpawnSpec,
} from "./process";

/**
 * LINK 2 of the orphan-prevention chain, proven against REAL processes: when the
 * host shuts down it must kill EVERY child runtime the ProcessLauncher spawned.
 * The unit test in process.test.ts uses a fake handle that only records kills;
 * this one spawns actual short-lived `node`/`bun` children and asserts their
 * pids are dead afterward (the real orphan-leak failure mode). It also proves a
 * crashed runtime is reaped from the live-set, not left as a phantom "running".
 *
 * Deterministic + fast: the children would sleep ~30s on their own, so any pid
 * still alive after teardown is a genuine orphan, not a timing flake.
 */

const agent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

/** True iff a process with `pid` is alive. `kill(pid, 0)` probes without signalling. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead). EPERM = alive but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitDead(pid: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (alive(pid)) {
    if (Date.now() > deadline) throw new Error(`pid ${pid} still alive`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * A real-process spawner that mirrors BunRuntimeSpawner's lifecycle contract
 * (kill via SIGTERM, onExit on real child exit) but launches a trivial sleeper
 * instead of a full runtime, so the test needs no port/health server. We track
 * every child it spawns so the harness can guarantee cleanup even on failure.
 */
function realSleeperSpawner() {
  const children: ChildProcess[] = [];
  const spawner: RuntimeSpawner = {
    spawn(spec: SpawnSpec): RuntimeHandle {
      // `node -e` sleeps far longer than the test; only an explicit kill ends it.
      const child = spawn(
        process.execPath,
        ["-e", "setTimeout(() => {}, 30000)"],
        { stdio: "ignore" },
      );
      children.push(child);
      return {
        port: spec.port,
        kill: () => {
          try {
            child.kill("SIGTERM");
          } catch {
            /* already gone */
          }
        },
        onExit: (cb) => child.once("exit", cb),
      };
    },
  };
  const pidOf = (i: number): number => {
    const pid = children[i]?.pid;
    if (pid === undefined) throw new Error(`child ${i} has no pid`);
    return pid;
  };
  return { spawner, children, pidOf };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const launcherOpts = (
  spawner: RuntimeSpawner,
  port: () => Promise<number>,
): ProcessLauncherOptions => ({
  spawner,
  workspaceDirFor: (a: Agent) => `/tmp/${a.id}/workspace`,
  dataDirFor: (a: Agent) => `/tmp/${a.id}/data`,
  mintToken: (a: Agent) => `token-${a.id}`,
  allocatePort: port,
  waitHealthy: async () => {}, // the sleeper has no health server; treat as up
});

test("shutdownAll kills every real child runtime — none orphaned", async () => {
  const { spawner, children, pidOf } = realSleeperSpawner();
  cleanup = () => {
    for (const c of children) c.kill("SIGKILL");
  };
  let nextPort = 6000;
  const launcher = new ProcessLauncher(
    launcherOpts(spawner, async () => nextPort++),
  );

  await launcher.ensureAwake(agent("sales"));
  await launcher.ensureAwake(agent("hr"));
  await launcher.ensureAwake(agent("ops"));

  const pids = [pidOf(0), pidOf(1), pidOf(2)];
  for (const pid of pids) expect(alive(pid)).toBe(true); // all running pre-shutdown

  // The host-shutdown path (host.stop() → launcher.shutdownAll()).
  launcher.shutdownAll();

  for (const pid of pids) await waitDead(pid);
  for (const pid of pids) expect(alive(pid)).toBe(false);

  // The live-set is empty: a restart would not re-touch a dead child.
  expect(await launcher.status("sales")).toBe("asleep");
  expect(await launcher.status("hr")).toBe("asleep");
  expect(await launcher.status("ops")).toBe("asleep");
});

test("sleep kills exactly the targeted real runtime, leaves the rest alive", async () => {
  const { spawner, children, pidOf } = realSleeperSpawner();
  cleanup = () => {
    for (const c of children) c.kill("SIGKILL");
  };
  let nextPort = 6100;
  const launcher = new ProcessLauncher(
    launcherOpts(spawner, async () => nextPort++),
  );

  await launcher.ensureAwake(agent("a")); // child 0
  await launcher.ensureAwake(agent("b")); // child 1

  await launcher.sleep("a");
  await waitDead(pidOf(0));
  expect(alive(pidOf(0))).toBe(false); // slept agent's runtime is dead
  expect(alive(pidOf(1))).toBe(true); // the other stays up

  launcher.shutdownAll();
  await waitDead(pidOf(1));
});

test("a crashed runtime is reaped from the live-set (no phantom running)", async () => {
  const { spawner, children, pidOf } = realSleeperSpawner();
  cleanup = () => {
    for (const c of children) c.kill("SIGKILL");
  };
  let nextPort = 6200;
  const launcher = new ProcessLauncher(
    launcherOpts(spawner, async () => nextPort++),
  );

  await launcher.ensureAwake(agent("flaky"));
  expect(await launcher.status("flaky")).toBe("running");

  // Simulate a crash: kill the underlying process out from under the launcher.
  const pid = pidOf(0);
  children[0]?.kill("SIGKILL");
  await waitDead(pid);

  // The onExit reaper must have evicted it; status must NOT lie about a dead pid.
  const deadline = Date.now() + 2_000;
  while ((await launcher.status("flaky")) === "running") {
    if (Date.now() > deadline) throw new Error("crashed runtime never reaped");
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(await launcher.status("flaky")).toBe("asleep");
});
