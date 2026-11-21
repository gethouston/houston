import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, expect, test } from "vitest";
import type { Agent } from "../domain/types";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
  type SpawnSpec,
} from "./process";

const agent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
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

function realSleeperSpawner() {
  const children: ChildProcess[] = [];
  const spawner: RuntimeSpawner = {
    spawn(spec: SpawnSpec): RuntimeHandle {
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
          } catch {}
        },
        onExit: (cb) =>
          child.once("exit", (code, signal) =>
            cb({ code, signal, stderrTail: [] }),
          ),
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
  waitHealthy: async () => {},
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
  for (const pid of pids) expect(alive(pid)).toBe(true);

  launcher.shutdownAll();

  for (const pid of pids) await waitDead(pid);
  for (const pid of pids) expect(alive(pid)).toBe(false);

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

  await launcher.ensureAwake(agent("a"));
  await launcher.ensureAwake(agent("b"));

  await launcher.sleep("a");
  await waitDead(pidOf(0));
  expect(alive(pidOf(0))).toBe(false);
  expect(alive(pidOf(1))).toBe(true);

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

  const pid = pidOf(0);
  children[0]?.kill("SIGKILL");
  await waitDead(pid);

  const deadline = Date.now() + 2_000;
  while ((await launcher.status("flaky")) === "running") {
    if (Date.now() > deadline) throw new Error("crashed runtime never reaped");
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(await launcher.status("flaky")).toBe("asleep");
});
