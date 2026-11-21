import {
  applyRoutineUpdate,
  createRoutine,
  loadRoutineRuns,
  loadRoutines,
  ROUTINE_AUTO_PAUSE_AFTER,
  saveRoutines,
} from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { TurnFireError } from "../channel/fire-error";
import type { EventHub } from "../events/hub";
import { CloudPaths } from "../paths";
import { AgentRenamingError } from "../ports";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { fireRoutineRun } from "./run";
import type { RoutineFirer } from "./scheduler";

const EDITED = Date.parse("2026-10-06T00:00:00.000Z");
const FIFTEEN_MIN = 15 * 60_000;

async function setup(r: Routine) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const root = workspaceRoot(ws, agent);
  await saveRoutines(vfs, root, [r]);
  const emit = vi.fn();
  return {
    vfs,
    ws,
    agent,
    root,
    emit,
    events: { emit } as unknown as EventHub,
  };
}

type Env = Awaited<ReturnType<typeof setup>>;

async function fireAt(env: Env, n: number, firer: RoutineFirer) {
  const [current] = (await loadRoutines(env.vfs, env.root)).items;
  if (!current) throw new Error("routine missing");
  return fireRoutineRun(
    {
      vfs: env.vfs,
      paths: new CloudPaths(),
      firer,
      events: env.events,
      now: () => new Date(EDITED + n * FIFTEEN_MIN),
      newId: () => `run-${n}`,
    },
    env.ws,
    env.agent,
    current,
  );
}

const refusing: RoutineFirer = {
  fire: async () =>
    Promise.reject(
      new TurnFireError(
        'runtime 409: {"error":"No provider connected.","code":"no_provider"}',
        409,
        "no_provider",
      ),
    ),
};

const routinesChanged = (env: Env) =>
  env.emit.mock.calls.filter(([, e]) => e.type === "RoutinesChanged").length;

test("an unpinned routine refused for no provider pauses once, then resumes on a chosen model", async () => {
  const legacy = createRoutine(
    { name: "Inbox sweep", prompt: "check", schedule: "*/15 * * * *" },
    "r1",
    new Date(EDITED).toISOString(),
  );
  expect(legacy.provider ?? null).toBeNull();
  const env = await setup(legacy);

  for (let n = 1; n <= ROUTINE_AUTO_PAUSE_AFTER; n++) {
    await expect(fireAt(env, n, refusing)).rejects.toBeInstanceOf(
      TurnFireError,
    );
    const [saved] = (await loadRoutines(env.vfs, env.root)).items;
    expect(saved?.enabled).toBe(n < ROUTINE_AUTO_PAUSE_AFTER);
  }

  const runs = (await loadRoutineRuns(env.vfs, env.root)).items;
  expect(runs).toHaveLength(ROUTINE_AUTO_PAUSE_AFTER);
  for (const run of runs) {
    expect(run).toMatchObject({
      status: "error",
      failure: { code: "no_model" },
      summary:
        "This routine has no model chosen, and the AI account it would use isn't connected.",
    });
  }
  const [paused] = (await loadRoutines(env.vfs, env.root)).items;
  expect(paused?.auto_paused).toEqual({
    reason: "model_unavailable",
    provider: "",
    cause: "no_model",
    failures: ROUTINE_AUTO_PAUSE_AFTER,
    at: new Date(EDITED + ROUTINE_AUTO_PAUSE_AFTER * FIFTEEN_MIN).toISOString(),
  });
  expect(routinesChanged(env)).toBe(1);

  if (!paused) throw new Error("routine missing");
  const resumeAt = new Date(EDITED + 20 * FIFTEEN_MIN).toISOString();
  const picked = applyRoutineUpdate(
    paused,
    { provider: "anthropic", model: "claude-sonnet-4-5" },
    resumeAt,
  );
  const resumed = applyRoutineUpdate(picked, { enabled: true }, resumeAt);
  expect(resumed.auto_paused).toBeUndefined();
  await saveRoutines(env.vfs, env.root, [resumed]);

  const fire = vi.fn(async () => undefined);
  await expect(fireAt(env, 21, { fire })).resolves.toMatchObject({
    runId: "run-21",
  });
  expect(fire).toHaveBeenCalledWith(
    expect.objectContaining({
      routine: expect.objectContaining({
        provider: "anthropic",
        model: "claude-sonnet-4-5",
      }),
    }),
  );
  const [after] = (await loadRoutines(env.vfs, env.root)).items;
  expect(after).toMatchObject({ enabled: true });
  expect(routinesChanged(env)).toBe(1);
});

test("a fire refused for another reason stays untyped and never pauses", async () => {
  const env = await setup(
    createRoutine(
      { name: "Inbox sweep", prompt: "check", schedule: "*/15 * * * *" },
      "r1",
      new Date(EDITED).toISOString(),
    ),
  );
  const outage: RoutineFirer = {
    fire: async () =>
      Promise.reject(new TurnFireError("runtime 500: boom", 500, null)),
  };
  for (let n = 1; n <= ROUTINE_AUTO_PAUSE_AFTER + 1; n++)
    await expect(fireAt(env, n, outage)).rejects.toBeInstanceOf(TurnFireError);
  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.enabled).toBe(true);
  const runs = (await loadRoutineRuns(env.vfs, env.root)).items;
  expect(runs.every((r) => r.failure === undefined)).toBe(true);
});

test("an unpinned refusal that names the agent's saved provider blames that account", async () => {
  const env = await setup(
    createRoutine(
      { name: "Inbox sweep", prompt: "check", schedule: "*/15 * * * *" },
      "r1",
      new Date(EDITED).toISOString(),
    ),
  );
  const savedLoggedOut: RoutineFirer = {
    fire: async () =>
      Promise.reject(
        new TurnFireError(
          'runtime 409: {"code":"no_provider","provider":"anthropic"}',
          409,
          "no_provider",
          TurnFireError.providerIn(
            '{"code":"no_provider","provider":"anthropic"}',
          ),
        ),
      ),
  };
  await expect(fireAt(env, 1, savedLoggedOut)).rejects.toBeInstanceOf(
    TurnFireError,
  );
  const [run] = (await loadRoutineRuns(env.vfs, env.root)).items;
  expect(run?.failure).toEqual({
    code: "creator_not_connected",
    provider: "anthropic",
  });
});

test("a pause that fails after the errored row is written never replaces the fire's error", async () => {
  const env = await setup(
    createRoutine(
      { name: "Inbox sweep", prompt: "check", schedule: "*/15 * * * *" },
      "r1",
      new Date(EDITED).toISOString(),
    ),
  );
  for (let n = 1; n < ROUTINE_AUTO_PAUSE_AFTER; n++)
    await expect(fireAt(env, n, refusing)).rejects.toBeInstanceOf(
      TurnFireError,
    );
  const save = env.vfs.writeText.bind(env.vfs);
  vi.spyOn(env.vfs, "writeText").mockImplementation(async (key, text) => {
    if (key.includes("routines.json") && !key.includes("routine_runs"))
      throw new AgentRenamingError("a1");
    return save(key, text);
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      fireAt(env, ROUTINE_AUTO_PAUSE_AFTER, refusing),
    ).rejects.toBeInstanceOf(TurnFireError);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("[routine-auto-pause] pause of"),
      expect.any(AgentRenamingError),
    );
  } finally {
    error.mockRestore();
    vi.restoreAllMocks();
  }
  const runs = (await loadRoutineRuns(env.vfs, env.root)).items;
  expect(runs).toHaveLength(ROUTINE_AUTO_PAUSE_AFTER);
  expect(runs[0]).toMatchObject({
    status: "error",
    failure: { code: "no_model" },
  });
  const [saved] = (await loadRoutines(env.vfs, env.root)).items;
  expect(saved?.enabled).toBe(true);
});
