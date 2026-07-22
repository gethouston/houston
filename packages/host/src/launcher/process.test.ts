import { expect, test } from "vitest";
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
 * (the real RuntimeProcessSpawner is exercised by an integration run, not here).
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

test("afterSpawn runs once per fresh runtime, including wake-from-idle respawns", async () => {
  const { spawner } = recordingSpawner();
  const started: string[] = [];
  const launcher = new ProcessLauncher(
    opts(spawner, {
      afterSpawn: async (a, endpoint) => {
        started.push(`${a.id}:${endpoint.baseUrl}`);
      },
    }),
  );
  const a = agent("shared");

  await launcher.ensureAwake(a);
  await launcher.ensureAwake(a);
  await launcher.sleep(a.id);
  await launcher.ensureAwake(a);

  expect(started).toEqual([
    "shared:http://127.0.0.1:5000",
    "shared:http://127.0.0.1:5001",
  ]);
});

test("a failed afterSpawn hook reaps the runtime so the next wake retries it", async () => {
  const { spawner, spawns, killed } = recordingSpawner();
  let attempts = 0;
  const launcher = new ProcessLauncher(
    opts(spawner, {
      afterSpawn: async () => {
        attempts++;
        if (attempts === 1) throw new Error("startup hook failed");
      },
    }),
  );
  const a = agent("shared");

  await expect(launcher.ensureAwake(a)).rejects.toThrow("startup hook failed");
  expect(killed).toEqual([5000]);
  expect(await launcher.status(a.id)).toBe("asleep");

  await expect(launcher.ensureAwake(a)).resolves.toMatchObject({
    baseUrl: "http://127.0.0.1:5001",
  });
  expect(spawns).toHaveLength(2);
  expect(attempts).toBe(2);
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

test("sleep resolves only after the child has ACTUALLY exited", async () => {
  // A rename moves the agent's directory right after sleeping it — resolving
  // on SIGTERM alone would let the move race the still-flushing child (and on
  // Windows the live child's cwd locks the directory outright).
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => {}, // the "process" ignores SIGTERM for a while
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("slow"));

  let slept = false;
  const sleeping = launcher.sleep("slow").then(() => {
    slept = true;
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(slept).toBe(false); // still waiting on the real exit

  exitCb?.(); // now the child actually dies
  await sleeping;
  expect(slept).toBe(true);
  expect(await launcher.status("slow")).toBe("asleep");
});

test("sleep gives up waiting after its bound when a child hangs on SIGTERM", async () => {
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => {},
        onExit: () => {}, // exit never fires — a truly hung process
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("hung"));
  await launcher.sleep("hung", 20); // bounded — resolves despite no exit
  expect(await launcher.status("hung")).toBe("asleep");
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

test("a runtime that exits mid-boot fails fast instead of waiting out the health budget", async () => {
  // The health probe alone can't tell "still booting" from "already dead" — it
  // would poll a dead port for the full budget. The exit signal must preempt it.
  const killed: number[] = [];
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => killed.push(5000),
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(
    opts(spawner, { waitHealthy: () => new Promise(() => {}) }), // never settles
  );

  const boot = launcher.ensureAwake(agent("crash"));
  // Let the async spawn (behind allocatePort's await) actually run, then die.
  await new Promise((r) => setTimeout(r, 0));
  if (!exitCb) throw new Error("spawn never registered onExit");
  exitCb(); // the child dies before ever answering /health
  await expect(boot).rejects.toThrow("exited before becoming healthy");
  expect(killed).toEqual([5000]); // kill() on an exited child is a safe no-op
  expect(await launcher.status("crash")).toBe("asleep"); // not cached as running
});

test("concurrent callers during a boot share one spawn and resolve only once healthy", async () => {
  // HOU-639: on a cold pod the desktop fires chat-history and provider-status
  // together; the loser of the spawn race used to be handed a port the child
  // hadn't bound yet and 502'd (rendered as an empty chat / disconnected
  // provider). Both callers must ride the same boot to the same endpoint.
  const { spawner, spawns } = recordingSpawner();
  let releaseHealth!: () => void;
  const health = new Promise<void>((r) => {
    releaseHealth = r;
  });
  const launcher = new ProcessLauncher(
    opts(spawner, { waitHealthy: () => health }),
  );
  const a = agent("sales");

  const first = launcher.ensureAwake(a);
  const second = launcher.ensureAwake(a);
  let secondResolved = false;
  void second.then(() => {
    secondResolved = true;
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(secondResolved).toBe(false); // must not resolve before healthy

  releaseHealth();
  const [ep1, ep2] = await Promise.all([first, second]);
  expect(ep2).toEqual(ep1);
  expect(spawns).toHaveLength(1); // one shared spawn, not one per caller
});

test("a failed shared boot rejects every waiter; the next call respawns fresh", async () => {
  const { spawner, spawns, killed } = recordingSpawner();
  let failHealth!: (err: Error) => void;
  const health = new Promise<void>((_, reject) => {
    failHealth = reject;
  });
  let calls = 0;
  const launcher = new ProcessLauncher(
    opts(spawner, {
      waitHealthy: () => (++calls === 1 ? health : Promise.resolve()),
    }),
  );
  const a = agent("flaky");

  const first = launcher.ensureAwake(a);
  const second = launcher.ensureAwake(a);
  failHealth(new Error("never healthy"));
  await expect(first).rejects.toThrow("never healthy");
  await expect(second).rejects.toThrow("never healthy");
  expect(killed).toEqual([5000]); // the dead boot was reaped

  const woken = await launcher.ensureAwake(a);
  expect(woken.baseUrl).toBe("http://127.0.0.1:5001");
  expect(spawns).toHaveLength(2);
});

test("multiple agents get distinct ports + processes", async () => {
  const { spawner } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const a = await launcher.ensureAwake(agent("a"));
  const b = await launcher.ensureAwake(agent("b"));
  expect(a.baseUrl).not.toBe(b.baseUrl);
});
