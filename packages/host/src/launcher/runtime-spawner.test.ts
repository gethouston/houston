import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Agent } from "../domain/types";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { ASSISTANT_AGENT_NAME } from "../routes/assistant";
import { assistantRuntimeRole } from "./assistant-role";
import { ProcessLauncher } from "./process";
import { runtimeSpawnEnv } from "./runtime-env";
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
  vi.unstubAllEnvs();
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

test("only the coordinator's child carries the assistant role, and no credential", async () => {
  // The whole point of deciding the role in the host: two agents, one spawner,
  // and the role variable reaches exactly one child. A gateway token reaches
  // neither — the credential stays in the host process.
  const launcher = new ProcessLauncher({
    spawner: new RuntimeProcessSpawner({
      command: ["runtime"],
      env: (spec) =>
        runtimeSpawnEnv({
          transcriptDualWrite: false,
          assistantRole: spec.assistantRole ?? null,
        }),
    }),
    workspaceDirFor: (a) => `/data/${a.name}`,
    dataDirFor: (a) => `/data/${a.name}/data`,
    mintToken: () => "secret",
    assistantRoleFor: (a) =>
      assistantRuntimeRole({ agentId: a.id, hostEnv: {} }),
    allocatePort: async () => 4317,
    waitHealthy: async () => {},
  });

  const agent = (id: string, name: string): Agent => ({
    id,
    workspaceId: "w1",
    name,
    createdAt: 0,
  });
  await launcher.ensureAwake(agent("w1/Writer", "Writer"));
  await launcher.ensureAwake(agent(`w1/${ASSISTANT_AGENT_NAME}`, "assistant"));

  const envs = spawnMock.mock.calls.map(
    (call) => (call[2] as { env: Record<string, string | undefined> }).env,
  );
  expect(envs).toHaveLength(2);
  expect(envs[0]).not.toHaveProperty("HOUSTON_ASSISTANT_ROLE");
  expect(envs[1]?.HOUSTON_ASSISTANT_ROLE).toBe("coordinator");
  for (const env of envs) {
    expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_TOKEN");
    expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_CP_URL");
  }
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

test.each([
  null,
  "coordinator",
] as const)("spawn strips parent host secrets and stamps only trusted role %s", (role) => {
  const secrets = [
    "HOUSTON_ASSISTANT_TOKEN",
    "HOUSTON_ASSISTANT_CP_URL",
    "HOUSTON_ASSISTANT_USER_ID",
    "HOUSTON_HOST_TOKEN",
    "HOUSTON_CREDENTIALS_URL",
    "HOUSTON_STORE_URL",
    "HOUSTON_USER_ID",
    "COMPOSIO_API_KEY",
  ];
  for (const key of secrets) vi.stubEnv(key, "host-only");
  vi.stubEnv("HOUSTON_ASSISTANT_ROLE", "coordinator");
  new RuntimeProcessSpawner({
    command: ["runtime"],
    env: () =>
      runtimeSpawnEnv({ transcriptDualWrite: false, assistantRole: role }),
  }).spawn({
    workspaceDir: "/agent",
    dataDir: "/data",
    token: "runtime",
    port: 4317,
  });
  const env = (spawnMock.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv }).env;
  for (const key of secrets) expect(env).not.toHaveProperty(key);
  expect(env.HOUSTON_ASSISTANT_ROLE).toBe(role ?? undefined);
});

test("spawn still hands the runtime the shared Houston home it authenticates from", () => {
  // HOUSTON_HOME is a path, not a credential: the runtime resolves the SHARED
  // Claude login dir from it (`<HOUSTON_HOME>/claude-login`), so withholding it
  // would send every agent to a home with no credential in it.
  vi.stubEnv("HOUSTON_HOME", "/houston-home");
  vi.stubEnv("HOUSTON_ASSISTANT_TOKEN", "host-only");
  new RuntimeProcessSpawner({ command: ["runtime"] }).spawn({
    workspaceDir: "/agent",
    dataDir: "/data",
    token: "runtime",
    port: 4317,
  });
  const env = (spawnMock.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv }).env;
  expect(env.HOUSTON_HOME).toBe("/houston-home");
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_TOKEN");
});
