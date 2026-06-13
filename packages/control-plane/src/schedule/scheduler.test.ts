import { test, expect } from "bun:test";
import type { Routine, RoutineRun } from "@houston/protocol";
import { createRoutine, loadRoutineRuns, saveRoutines } from "@houston/domain";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { MemoryTurnBus } from "../turn/bus";
import { workspaceRoot } from "../routes/agent-data";
import { CloudPaths } from "../paths";
import { Scheduler, type FiringJob, type RoutineFirer } from "./scheduler";

/**
 * The scheduler driver: scans agents, fires routines that come due in the
 * tick window exactly once, records runs, and dedups across replicas via the
 * bus lock. Cron math is the domain's job (schedule.test.ts); here we pin the
 * driver's scan / dedup / run-recording / error-handling behavior.
 */

const ENABLED = "0 14 * * *"; // 14:00 UTC daily

/** A capturing firer; optionally throws to exercise the error path. */
class CaptureFirer implements RoutineFirer {
  jobs: FiringJob[] = [];
  constructor(private readonly throwMessage?: string) {}
  async fire(job: FiringJob): Promise<void> {
    this.jobs.push(job);
    if (this.throwMessage) throw new Error(this.throwMessage);
  }
}

async function setup(routines: Routine[]) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  await saveRoutines(vfs, workspaceRoot(ws, agent), routines);
  return { store, vfs, ws, agent };
}

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine({ name: "R", prompt: "do it", schedule: ENABLED }, over.id ?? "r1", "2026-06-12T00:00:00.000Z"),
    ...over,
  };
}

const SINCE = new Date("2026-06-12T13:59:00.000Z");
const DUE = new Date("2026-06-12T14:00:30.000Z"); // 14:00 instant falls in (SINCE, DUE]

function makeScheduler(env: Awaited<ReturnType<typeof setup>>, firer: RoutineFirer, lock = new MemoryTurnBus()) {
  let id = 0;
  const s = new Scheduler({
    store: env.store,
    vfs: env.vfs,
    paths: new CloudPaths(),
    lock,
    firer,
    now: () => SINCE, // start() pins lastTick to SINCE
    newId: () => `run-${++id}`,
  });
  return s;
}

test("a due routine fires once, with the right job and a recorded running run", async () => {
  const env = await setup([routine({ schedule: ENABLED, prompt: "send the report" })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  expect(firer.jobs).toHaveLength(1);
  expect(firer.jobs[0]!.routine.prompt).toBe("send the report");
  expect(firer.jobs[0]!.conversationId).toBe("routine-r1"); // shared chat_mode

  const { items } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ routine_id: "r1", status: "running" });
});

test("a routine not yet due does not fire", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(new Date("2026-06-12T13:59:30.000Z")); // before 14:00
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
  const lock = new MemoryTurnBus(); // the shared bus both replicas use
  const firerA = new CaptureFirer();
  const firerB = new CaptureFirer();
  const a = makeScheduler(env, firerA, lock);
  const b = makeScheduler(env, firerB, lock);
  a.start();
  b.start();

  await a.tick(DUE);
  await b.tick(DUE); // same instant → loses the setNx race

  expect(firerA.jobs.length + firerB.jobs.length).toBe(1);
});

test("per_run routine fires into a run-unique conversation", async () => {
  const env = await setup([routine({ schedule: ENABLED, chat_mode: "per_run" })]);
  const firer = new CaptureFirer();
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);
  expect(firer.jobs[0]!.conversationId).toBe("routine-r1-run-1");
});

test("a fire failure marks the run errored — never stuck running, never silent", async () => {
  const env = await setup([routine({ schedule: ENABLED })]);
  const firer = new CaptureFirer("runtime unreachable");
  const s = makeScheduler(env, firer);
  s.start();
  await s.tick(DUE);

  const { items } = await loadRoutineRuns(env.vfs, workspaceRoot(env.ws, env.agent));
  expect(items).toHaveLength(1);
  const run = items[0] as RoutineRun;
  expect(run.status).toBe("error");
  expect(run.summary).toContain("runtime unreachable");
  expect(run.completed_at).toBeTruthy();
});
