import {
  createRoutine,
  loadRoutineRuns,
  saveRoutines,
  setPreference,
} from "@houston/domain";
import type { Routine, RoutineRun } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { TurnFireError } from "../channel/fire-error";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { type FiringJob, type RoutineFirer, Scheduler } from "./scheduler";

const ENABLED = "0 14 * * *";

class CaptureFirer implements RoutineFirer {
  jobs: FiringJob[] = [];
  constructor(private readonly throwWith?: string | Error) {}
  async fire(job: FiringJob): Promise<void> {
    this.jobs.push(job);
    if (this.throwWith instanceof Error) throw this.throwWith;
    if (this.throwWith) throw new Error(this.throwWith);
  }
}

async function setup(routines: Routine[]) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  await setPreference(vfs, ws.id, "timezone", "UTC");
  await saveRoutines(vfs, workspaceRoot(ws, agent), routines);
  return { store, vfs, ws, agent };
}

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine(
      { name: "R", prompt: "do it", schedule: ENABLED },
      over.id ?? "r1",
      "2026-06-12T00:00:00.000Z",
    ),
    ...over,
  };
}

const SINCE = new Date("2026-06-12T13:59:00.000Z");
const DUE = new Date("2026-06-12T14:00:30.000Z");

function makeScheduler(
  env: Awaited<ReturnType<typeof setup>>,
  firer: RoutineFirer,
  lock = new MemoryTurnBus(),
) {
  let id = 0;
  const s = new Scheduler({
    store: env.store,
    vfs: env.vfs,
    paths: new CloudPaths(),
    lock,
    firer,
    now: () => SINCE,
    newId: () => `run-${++id}`,
  });
  return s;
}

test("a due routine fires once, with the right job and a recorded running run", async () => {
  const env = await setup([
    routine({ schedule: ENABLED, prompt: "send the report" }),
  ]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  expect(firer.jobs).toHaveLength(1);
  expect(firer.jobs[0]?.routine.prompt).toBe("send the report");
  expect(firer.jobs[0]?.conversationId).toBe("routine-r1");

  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ routine_id: "r1", status: "running" });
});

test("a routine not yet due does not fire", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(new Date("2026-06-12T13:59:30.000Z"));
  expect(firer.jobs).toHaveLength(0);
});

test("a disabled routine never fires", async () => {
  const env = await setup([routine({ schedule: "* * * * *", enabled: false })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);
  expect(firer.jobs).toHaveLength(0);
});

test("the same scheduled instant fires once across replicas (shared lock)", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const lock = new MemoryTurnBus();
  const firerA = new CaptureFirer();
  const firerB = new CaptureFirer();
  const a = makeScheduler(env, firerA, lock);
  const b = makeScheduler(env, firerB, lock);
  a.start();
  b.start();

  await a.tick(DUE);
  await b.tick(DUE);

  expect(firerA.jobs.length + firerB.jobs.length).toBe(1);
});

test("per_run routine fires into a run-unique conversation", async () => {
  const env = await setup([
    routine({ schedule: ENABLED, chat_mode: "per_run" }),
  ]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);
  expect(firer.jobs[0]?.conversationId).toBe("routine-r1-run-1");
});

test("a fire failure marks the run errored — never stuck running, never silent", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer("runtime unreachable");
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect(items).toHaveLength(1);
  const run = items[0] as RoutineRun;
  expect(run.status).toBe("error");
  expect(run.summary).toContain("runtime unreachable");
  expect(run.completed_at).toBeTruthy();
});

test("a no-provider 409 fire records the errored run but logs a warning, not an error", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer(
    new TurnFireError(
      'runtime 409: {"error":"No provider connected."}',
      409,
      "no_provider",
    ),
  );
  const s = makeScheduler(env, firer);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    s.start();
    await s.tick(DUE);
    expect(warn).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }

  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  expect(items).toHaveLength(1);
  expect((items[0] as RoutineRun).status).toBe("error");
  expect((items[0] as RoutineRun).failure).toEqual({ code: "no_model" });
});

test("a no-provider 409 on a PINNED routine names the provider the creator must connect", async () => {
  const env = await setup([
    routine({ schedule: ENABLED, provider: "anthropic" }),
  ]);
  const firer = new CaptureFirer(
    new TurnFireError(
      'runtime 409: {"error":"No provider connected."}',
      409,
      "no_provider",
    ),
  );
  const s = makeScheduler(env, firer);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    s.start();
    await s.tick(DUE);
  } finally {
    warn.mockRestore();
  }

  const { items } = await loadRoutineRuns(
    env.vfs,
    workspaceRoot(env.ws, env.agent),
  );
  const run = items[0] as RoutineRun;
  expect(run.failure).toEqual({
    code: "creator_not_connected",
    provider: "anthropic",
  });
  expect(run.summary).toBe(
    "The routine's creator has no Claude account connected.",
  );
});

test("the workspace timezone preference re-times routines (account-wide zone)", async () => {
  const env = await setup([routine({ schedule: "0 9 * * *" })]);
  await setPreference(env.vfs, env.ws.id, "timezone", "America/Bogota");
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);
  expect(firer.jobs).toHaveLength(1);
  expect(firer.jobs[0]?.routine.schedule).toBe("0 9 * * *");
});

function muteConsole() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return { error, restore: () => error.mockRestore() };
}

test("a BOM'd routines.json still fires — the byte is decoded, not fatal", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const key = `${workspaceRoot(env.ws, env.agent)}/.houston/routines/routines.json`;
  const raw = await env.vfs.readText(key);
  await env.vfs.writeBytes(key, Buffer.from(`﻿${raw}`, "utf8"));

  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  expect(firer.jobs).toHaveLength(1);
});

test("an unreadable routines.json costs that agent only — every other agent still fires", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const broken = await env.store.createAgent({
    workspaceId: env.ws.id,
    name: "Broken",
  });
  await env.vfs.writeText(
    `${workspaceRoot(env.ws, broken)}/.houston/routines/routines.json`,
    "{not json",
  );

  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  const log = muteConsole();
  try {
    s.start();
    await s.tick(DUE);
    expect(log.error).toHaveBeenCalled();
  } finally {
    log.restore();
  }
  expect(firer.jobs).toHaveLength(1);
  expect(firer.jobs[0]?.agent.id).toBe(env.agent.id);
});

test("an unreadable routines.json still lets that agent's runs settle", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  const root = workspaceRoot(env.ws, env.agent);
  await env.vfs.writeText(`${root}/.houston/routines/routines.json`, "{ bad");
  const log = muteConsole();
  try {
    await expect(
      s.tick(new Date(DUE.getTime() + 60_000)),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  } finally {
    log.restore();
  }
});
