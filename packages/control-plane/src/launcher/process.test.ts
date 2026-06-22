import { test, expect } from "bun:test";
import type { Agent } from "../domain/types";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
  type SpawnSpec,
} from "./process";

/**
 * The local launcher's lifecycle: lazily spawn one runtime per agent, reuse a
 * warm one, kill on sleep, surface a never-healthy spawn instead of caching a
 * zombie. The spawner + health probe are injected so this is a pure unit test
 * (the real BunRuntimeSpawner is exercised by an integration run, not here).
 */

const agent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

/** Records spawns + kills; hands back sequential ports. */
function recordingSpawner() {
  const spawns: SpawnSpec[] = [];
  const killed: number[] = [];
  let nextPort = 5000;
  const spawner: RuntimeSpawner = {
    spawn(spec) {
      spawns.push(spec);
      const port = nextPort++;
      const handle: RuntimeHandle = { port, kill: () => killed.push(port) };
      return handle;
    },
  };
  return { spawner, spawns, killed };
}

const opts = (
  spawner: RuntimeSpawner,
  over: Partial<ProcessLauncherOptions> = {},
): ProcessLauncherOptions => ({
  spawner,
  workspaceDirFor: (a: Agent) => `/houston/${a.id}/workspace`,
  dataDirFor: (a: Agent) => `/houston/${a.id}/data`,
  mintToken: (a: Agent) => `token-${a.id}`,
  allocatePort: async () => 0, // overridden by the spawner's own port in the handle
  waitHealthy: async () => {}, // healthy immediately
  ...over,
});

test("ensureAwake spawns one runtime per agent with its workspace/data/token", async () => {
  const { spawner, spawns } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));

  const ep = await launcher.ensureAwake(agent("sales"));
  expect(ep.baseUrl).toBe("http://127.0.0.1:5000");
  expect(ep.token).toBe("token-sales");
  expect(spawns).toHaveLength(1);
  expect(spawns[0]).toMatchObject({
    workspaceDir: "/houston/sales/workspace",
    dataDir: "/houston/sales/data",
    token: "token-sales",
  });
  expect(await launcher.status("sales")).toBe("running");
});

test("a warm runtime is reused, not respawned", async () => {
  const { spawner, spawns } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const a = agent("hr");
  const first = await launcher.ensureAwake(a);
  const second = await launcher.ensureAwake(a);
  expect(second).toEqual(first);
  expect(spawns).toHaveLength(1); // reused
});

test("sleep kills the process; the next ensureAwake spawns a fresh one", async () => {
  const { spawner, spawns, killed } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const a = agent("ops");
  await launcher.ensureAwake(a); // port 5000
  await launcher.sleep("ops");
  expect(killed).toEqual([5000]);
  expect(await launcher.status("ops")).toBe("asleep");

  const woken = await launcher.ensureAwake(a); // port 5001
  expect(woken.baseUrl).toBe("http://127.0.0.1:5001");
  expect(spawns).toHaveLength(2);
});

test("a runtime that never becomes healthy is killed and not cached (the turn errors visibly)", async () => {
  const { spawner, killed } = recordingSpawner();
  const launcher = new ProcessLauncher(
    opts(spawner, {
      waitHealthy: async () => {
        throw new Error("never healthy");
      },
    }),
  );
  await expect(launcher.ensureAwake(agent("bad"))).rejects.toThrow(
    "never healthy",
  );
  expect(killed).toEqual([5000]); // zombie reaped
  expect(await launcher.status("bad")).toBe("asleep"); // not cached as running
});

test("multiple agents get distinct ports + processes", async () => {
  const { spawner } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const a = await launcher.ensureAwake(agent("a"));
  const b = await launcher.ensureAwake(agent("b"));
  expect(a.baseUrl).not.toBe(b.baseUrl);
});
