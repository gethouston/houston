import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Agent } from "../domain/types";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { ProcessLauncher } from "./process";
import { RuntimeProcessSpawner } from "./runtime-spawner";

/** A stand-in ChildProcess: an emitter with the bits the spawner touches. */
function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: null,
    stderr: null,
    kill: vi.fn(),
  });
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockReturnValue(fakeChild());
});

afterEach(() => {
  vi.useRealTimers();
});

test("spawn exposes a configured shared-skills directory to the runtime", () => {
  const spawner = new RuntimeProcessSpawner({ command: ["runtime"] });

  spawner.spawn({
    workspaceDir: "/data/Work/Writer",
    dataDir: "/data/Work/Writer/.houston/runtime",
    sharedSkillsDir: "/data/Work/.shared/skills",
    token: "secret",
    port: 4317,
  });

  expect(spawnMock).toHaveBeenCalledOnce();
  const options = spawnMock.mock.calls[0]?.[2] as {
    env: Record<string, string | undefined>;
  };
  expect(options.env.HOUSTON_SHARED_SKILLS_DIR).toBe(
    "/data/Work/.shared/skills",
  );
});

test("spawn omits the shared-skills env when no filesystem mirror is available", () => {
  const spawner = new RuntimeProcessSpawner({ command: ["runtime"] });

  spawner.spawn({
    workspaceDir: "/data/agent",
    dataDir: "/data/agent/data",
    token: "secret",
    port: 4317,
  });

  const options = spawnMock.mock.calls[0]?.[2] as {
    env: Record<string, string | undefined>;
  };
  expect(options.env).not.toHaveProperty("HOUSTON_SHARED_SKILLS_DIR");
});

test("a child that fails to spawn ('error', never 'exit') still fires the exit callback, exactly once", () => {
  // A missing/unstaged runtime binary emits 'error' + 'close' and NEVER 'exit'.
  // Listening for 'exit' alone left the launcher's abort hook silent, so the
  // boot polled a corpse for the whole 60s health budget.
  const child = fakeChild();
  spawnMock.mockReturnValue(child);
  const handle = new RuntimeProcessSpawner({ command: ["runtime"] }).spawn({
    workspaceDir: "/data/agent",
    dataDir: "/data/agent/data",
    token: "secret",
    port: 4317,
  });

  let exits = 0;
  handle.onExit?.(() => exits++);
  child.emit("error", new Error("spawn ENOENT"));
  expect(exits).toBe(1);

  // The trailing events of the same death must not fire the callback again.
  child.emit("close", 1, null);
  child.emit("exit", 1, null);
  expect(exits).toBe(1);
});

test("each onExit registration gets its own one-shot callback", () => {
  // The launcher registers separately for the boot abort and for sleep's
  // "wait until the child is actually gone" — both must be told.
  const child = fakeChild();
  spawnMock.mockReturnValue(child);
  const handle = new RuntimeProcessSpawner({ command: ["runtime"] }).spawn({
    workspaceDir: "/data/agent",
    dataDir: "/data/agent/data",
    token: "secret",
    port: 4317,
  });

  const fired: string[] = [];
  handle.onExit?.(() => fired.push("boot"));
  handle.onExit?.(() => fired.push("sleep"));
  child.emit("exit", 0, null);
  child.emit("close", 0, null);

  expect(fired).toEqual(["boot", "sleep"]);
});

test("a runtime that fails to spawn aborts the boot instead of burning the health budget", () => {
  vi.useFakeTimers();
  const child = fakeChild();
  spawnMock.mockReturnValue(child);
  const agent: Agent = {
    id: "sales",
    workspaceId: "w1",
    name: "Sales",
    createdAt: 0,
  };
  const launcher = new ProcessLauncher({
    spawner: new RuntimeProcessSpawner({ command: ["missing-runtime"] }),
    workspaceDirFor: () => "/data/agent",
    dataDirFor: () => "/data/agent/data",
    mintToken: () => "secret",
    allocatePort: async () => 4317,
    // Stands in for the production /health poll against a port nobody bound:
    // it keeps trying until the 60s budget runs out.
    waitHealthy: () =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("never became healthy")), 60_000);
      }),
  });

  const started = Date.now();
  let failure: string | undefined;
  const boot = launcher.ensureAwake(agent).catch((err: Error) => {
    failure = err.message;
  });

  return (async () => {
    await vi.advanceTimersByTimeAsync(0); // let the spawn actually happen
    child.emit("error", new Error("spawn ENOENT"));
    await vi.advanceTimersByTimeAsync(0);
    await boot;

    expect(failure).toBe("runtime exited before becoming healthy");
    expect(Date.now() - started).toBeLessThan(1_000); // not the 60s budget
    expect(await launcher.status("sales")).toBe("asleep");
  })();
});
