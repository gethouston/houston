import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { RuntimeProcessSpawner } from "./runtime-spawner";

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockReturnValue(
    Object.assign(new EventEmitter(), {
      stdout: null,
      stderr: null,
      kill: vi.fn(),
    }),
  );
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
