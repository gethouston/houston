import { expect, test } from "vitest";
import type { Agent } from "../domain/types";
import { LauncherClosedError } from "../ports";
import {
  ProcessLauncher,
  type ProcessLauncherOptions,
  type RuntimeHandle,
  type RuntimeSpawner,
  type SpawnSpec,
} from "./process";
import type { RuntimeExit } from "./process-types";

const agent = (id: string): Agent => ({
  id,
  workspaceId: "w1",
  name: id,
  createdAt: 0,
});

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
  allocatePort: async () => 0,
  waitHealthy: async () => {},
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

test("local filesystem profiles pass the workspace shared-skills directory", async () => {
  const { spawner, spawns } = recordingSpawner();
  const launcher = new ProcessLauncher(
    opts(spawner, {
      sharedSkillsDirFor: (a) => `/houston/${a.workspaceId}/shared/skills`,
    }),
  );

  await launcher.ensureAwake(agent("sales"));

  expect(spawns[0]?.sharedSkillsDir).toBe("/houston/w1/shared/skills");
});

test("a warm runtime is reused, not respawned", async () => {
  const { spawner, spawns } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const a = agent("hr");
  const first = await launcher.ensureAwake(a);
  const second = await launcher.ensureAwake(a);
  expect(second).toEqual(first);
  expect(spawns).toHaveLength(1);
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
  await launcher.ensureAwake(a);
  await launcher.sleep("ops");
  expect(killed).toEqual([5000]);
  expect(await launcher.status("ops")).toBe("asleep");

  const woken = await launcher.ensureAwake(a);
  expect(woken.baseUrl).toBe("http://127.0.0.1:5001");
  expect(spawns).toHaveLength(2);
});

test("a healthy runtime that dies on its own is reported with its exit; a drained or shut-down one is not", async () => {
  let exitCb: ((exit?: RuntimeExit) => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => {
          setTimeout(
            () => exitCb?.({ code: 0, signal: null, stderrTail: [] }),
            5,
          );
        },
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const deaths: { agent: string; exit: RuntimeExit }[] = [];
  const launcher = new ProcessLauncher(
    opts(spawner, {
      reportDeath: (a, exit) => deaths.push({ agent: a.id, exit }),
    }),
  );

  await launcher.ensureAwake(agent("ram"));
  exitCb?.({
    code: null,
    signal: "SIGKILL",
    stderrTail: ["Killed"],
  });
  expect(await launcher.status("ram")).toBe("asleep");
  expect(deaths).toEqual([
    {
      agent: "ram",
      exit: { code: null, signal: "SIGKILL", stderrTail: ["Killed"] },
    },
  ]);

  await launcher.ensureAwake(agent("ram"));
  await launcher.sleep("ram");
  expect(deaths).toHaveLength(1);

  await launcher.ensureAwake(agent("ram"));
  exitCb?.();
  expect(deaths).toHaveLength(1);

  await launcher.ensureAwake(agent("ram"));
  launcher.shutdownAll();
  exitCb?.({ code: null, signal: "SIGTERM", stderrTail: [] });
  expect(deaths).toHaveLength(1);
});

test("sleep resolves only after the child has ACTUALLY exited", async () => {
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => {},
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
  expect(slept).toBe(false);

  exitCb?.();
  await sleeping;
  expect(slept).toBe(true);
  expect(await launcher.status("slow")).toBe("asleep");
});

test("a child that ignores SIGTERM is SIGKILLed; sleep resolves once it actually dies", async () => {
  let exitCb: (() => void) | undefined;
  const signals: string[] = [];
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => signals.push("TERM"),
        forceKill: () => {
          signals.push("KILL");
          exitCb?.();
        },
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("wedged"));
  await launcher.sleep("wedged", 20, 20);
  expect(signals).toEqual(["TERM", "KILL"]);
  expect(await launcher.status("wedged")).toBe("asleep");
});

test("sleep REJECTS when the child survives even SIGKILL — a live child is never reported asleep (HOU-827)", async () => {
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => {},
        forceKill: () => {},
        onExit: () => {},
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("hung"));
  await expect(launcher.sleep("hung", 20, 20)).rejects.toThrow(
    "refusing to report it asleep",
  );
  expect(await launcher.status("hung")).toBe("running");
});

test("ensureAwake during a drain waits for the exit instead of racing a second child over the directory", async () => {
  let exitCb: (() => void) | undefined;
  let spawned = 0;
  const spawner: RuntimeSpawner = {
    spawn() {
      spawned += 1;
      const mine = spawned;
      return {
        port: 5000 + mine,
        kill: () => {
          if (mine === 1) setTimeout(() => exitCb?.(), 30);
        },
        onExit: (cb) => {
          if (mine === 1) exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("drainy"));
  const sleeping = launcher.sleep("drainy", 5_000);
  const endpoint = await launcher.ensureAwake(agent("drainy"));
  await sleeping;
  expect(spawned).toBe(2);
  expect(endpoint.baseUrl).toBe("http://127.0.0.1:5002");
});

test("a hold acquired MID-BOOT aborts the boot before the child spawns", async () => {
  let releasePort: ((port: number) => void) | undefined;
  let spawned = 0;
  const spawner: RuntimeSpawner = {
    spawn() {
      spawned += 1;
      return { port: 5000, kill: () => {} };
    },
  };
  const launcher = new ProcessLauncher(
    opts(spawner, {
      allocatePort: () =>
        new Promise<number>((resolve) => {
          releasePort = resolve;
        }),
    }),
  );
  const boot = launcher.ensureAwake(agent("mid-boot"));
  const release = launcher.hold("mid-boot");
  releasePort?.(5001);
  await expect(boot).rejects.toThrow("is being renamed");
  expect(spawned).toBe(0);
  release();
});

test("hold() blocks ensureAwake for the id until released (the rename latch)", async () => {
  const { spawner } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  const release = launcher.hold("held-agent");
  await expect(launcher.ensureAwake(agent("held-agent"))).rejects.toThrow(
    "is being renamed",
  );
  await launcher.ensureAwake(agent("other-agent"));
  release();
  release();
  await launcher.ensureAwake(agent("held-agent"));
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
  expect(killed).toEqual([5000]);
  expect(await launcher.status("bad")).toBe("asleep");
});

test("a runtime that exits mid-boot fails fast instead of waiting out the health budget", async () => {
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
    opts(spawner, { waitHealthy: () => new Promise(() => {}) }),
  );

  const boot = launcher.ensureAwake(agent("crash"));
  await new Promise((r) => setTimeout(r, 0));
  if (!exitCb) throw new Error("spawn never registered onExit");
  exitCb();
  await expect(boot).rejects.toThrow("exited before becoming healthy");
  expect(killed).toEqual([5000]);
  expect(await launcher.status("crash")).toBe("asleep");
});

test("concurrent callers during a boot share one spawn and resolve only once healthy", async () => {
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
  expect(secondResolved).toBe(false);

  releaseHealth();
  const [ep1, ep2] = await Promise.all([first, second]);
  expect(ep2).toEqual(ep1);
  expect(spawns).toHaveLength(1);
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
  expect(killed).toEqual([5000]);

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

test("ensureAwake during shutdownAllAndWait's drain is REFUSED, never respawned (PRODUCT-1399)", async () => {
  let exitCb: (() => void) | undefined;
  let spawned = 0;
  const spawner: RuntimeSpawner = {
    spawn() {
      spawned += 1;
      return {
        port: 5000 + spawned,
        kill: () => setTimeout(() => exitCb?.(), 30),
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("polled"));
  expect(launcher.isClosed()).toBe(false);

  const shutdown = launcher.shutdownAllAndWait(5_000);
  expect(launcher.isClosed()).toBe(true);
  await expect(launcher.ensureAwake(agent("polled"))).rejects.toBeInstanceOf(
    LauncherClosedError,
  );
  await shutdown;
  await expect(launcher.ensureAwake(agent("polled"))).rejects.toThrow(
    "shutting down",
  );
  expect(spawned).toBe(1);
  expect(await launcher.status("polled")).toBe("asleep");
});

test("shutdownAll (the sync variant) latches the launcher the same way", async () => {
  const { spawner, spawns, killed } = recordingSpawner();
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("a"));
  launcher.shutdownAll();
  expect(launcher.isClosed()).toBe(true);
  expect(killed).toEqual([5000]);
  await expect(launcher.ensureAwake(agent("b"))).rejects.toBeInstanceOf(
    LauncherClosedError,
  );
  expect(spawns).toHaveLength(1);
});

test("a boot that entered BEFORE shutdown but had not spawned yet is refused, so its child cannot outlive the sweep", async () => {
  const { spawner, spawns } = recordingSpawner();
  let releasePort!: () => void;
  const launcher = new ProcessLauncher(
    opts(spawner, {
      allocatePort: () =>
        new Promise<number>((resolve) => {
          releasePort = () => resolve(0);
        }),
    }),
  );
  const boot = launcher.ensureAwake(agent("late"));
  await new Promise((r) => setTimeout(r, 0));
  await launcher.shutdownAllAndWait();
  releasePort();
  await expect(boot).rejects.toBeInstanceOf(LauncherClosedError);
  expect(spawns).toHaveLength(0);
});

test("shutdownAllAndWait waits out the drain budget, then SIGKILLs a survivor", async () => {
  const events: string[] = [];
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn(spec) {
      return {
        port: spec.port,
        kill: () => events.push("SIGTERM"),
        forceKill: () => {
          events.push("SIGKILL");
          exitCb?.();
        },
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("wedged"));

  const started = Date.now();
  await launcher.shutdownAllAndWait(50, 1_000);
  expect(events).toEqual(["SIGTERM", "SIGKILL"]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(45);
});

test("shutdownAllAndWait returns as soon as a draining child exits, never escalating", async () => {
  const events: string[] = [];
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn(spec) {
      return {
        port: spec.port,
        kill: () => {
          events.push("SIGTERM");
          setTimeout(() => exitCb?.(), 10);
        },
        forceKill: () => events.push("SIGKILL"),
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(opts(spawner));
  await launcher.ensureAwake(agent("busy"));

  const started = Date.now();
  await launcher.shutdownAllAndWait(5_000, 1_000);
  expect(events).toEqual(["SIGTERM"]);
  expect(Date.now() - started).toBeLessThan(1_000);
});

test("rename refusal uses agent-facing punctuation without an em dash", async () => {
  const launcher = new ProcessLauncher({
    spawner: {
      spawn: () => {
        throw new Error("unexpected spawn");
      },
    },
    workspaceDirFor: () => "/agent",
    dataDirFor: () => "/data",
    mintToken: () => "token",
  });
  const release = launcher.hold("agent");
  await expect(
    launcher.ensureAwake({
      id: "agent",
      workspaceId: "w",
      name: "Agent",
      createdAt: 0,
    }),
  ).rejects.toThrow("agent 'agent' is being renamed - retry with its new id");
  release();
});

test("a boot killed by the drain fails as the drain, not as a crash", async () => {
  let exitCb: (() => void) | undefined;
  const spawner: RuntimeSpawner = {
    spawn() {
      return {
        port: 5000,
        kill: () => setTimeout(() => exitCb?.(), 0),
        onExit: (cb) => {
          exitCb = cb;
        },
      };
    },
  };
  const launcher = new ProcessLauncher(
    opts(spawner, { waitHealthy: () => new Promise(() => {}) }),
  );

  const boot = launcher.ensureAwake(agent("booting"));
  await new Promise((r) => setTimeout(r, 0));
  if (!exitCb) throw new Error("spawn never registered onExit");
  launcher.shutdownAll();
  await expect(boot).rejects.toBeInstanceOf(LauncherClosedError);
});
