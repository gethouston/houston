import {
  createRoutine,
  createRoutineRun,
  loadRoutineRuns,
  saveRoutineRuns,
  saveRoutines,
  setPreference,
} from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { burnRoutineFireInstant } from "./fire-lock";
import { type FiringJob, type RoutineFirer, Scheduler } from "./scheduler";

const SINCE = new Date("2026-06-12T13:59:00.000Z");
const DUE = new Date("2026-06-12T14:00:30.000Z");

function routine(id: string, enabled = true): Routine {
  return createRoutine(
    { name: id, prompt: "do it", schedule: "0 14 * * *", enabled },
    id,
    "2026-06-12T00:00:00.000Z",
  );
}

class CaptureFirer implements RoutineFirer {
  jobs: FiringJob[] = [];
  async fire(job: FiringJob): Promise<void> {
    this.jobs.push(job);
  }
}

test("external mode disables only cron firing and still reconciles running runs", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const scheduled = routine("scheduled");
  const reconciling = routine("reconciling", false);
  const root = workspaceRoot(ws, agent);
  await setPreference(vfs, ws.id, "timezone", "UTC");
  await saveRoutines(vfs, root, [scheduled, reconciling]);
  await saveRoutineRuns(vfs, root, [
    createRoutineRun(reconciling, "existing-run", "2026-06-12T13:00:00.000Z"),
  ]);
  const firer = new CaptureFirer();
  const scheduler = new Scheduler({
    store,
    vfs,
    paths: new CloudPaths(),
    lock: new MemoryTurnBus(),
    firer,
    mode: "external",
    now: () => SINCE,
    newId: () => "activity-1",
  });
  scheduler.start();
  await scheduler.tick(DUE);
  scheduler.stop();

  expect(firer.jobs).toHaveLength(0);
  const { items } = await loadRoutineRuns(vfs, root);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: "existing-run", status: "error" });
});

async function graceSetup() {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  const scheduled = routine("scheduled");
  await setPreference(vfs, ws.id, "timezone", "UTC");
  await saveRoutines(vfs, workspaceRoot(ws, agent), [scheduled]);
  const firer = new CaptureFirer();
  const lock = new MemoryTurnBus();
  const scheduler = new Scheduler({
    store,
    vfs,
    paths: new CloudPaths(),
    lock,
    firer,
    cronFireGraceMs: 120_000,
    now: () => SINCE,
    newId: () => "run-1",
  });
  return { scheduler, firer, lock };
}

test("cron fire grace defers a due instant, then fires it once aged past the grace", async () => {
  const { scheduler, firer } = await graceSetup();

  // Due at 14:00:00; at 14:00:30 the instant is younger than the grace, so the
  // external delivery still owns it.
  await scheduler.tick(DUE);
  expect(firer.jobs).toHaveLength(0);

  // 14:02:30: the shifted windows tile — this tick's window now covers the
  // instant, and it fires exactly once with the TRUE cron time.
  await scheduler.tick(new Date("2026-06-12T14:02:30.000Z"));
  expect(firer.jobs).toHaveLength(1);

  await scheduler.tick(new Date("2026-06-12T14:04:30.000Z"));
  expect(firer.jobs).toHaveLength(1);
});

test("a graced fire dedupes against an instant the external delivery already burned", async () => {
  const { scheduler, firer, lock } = await graceSetup();

  // The control-plane delivery fired the 14:00:00 instant on time; its burn
  // uses the same key the graced local scan will contest.
  const instant = new Date("2026-06-12T14:00:00.000Z");
  expect(await burnRoutineFireInstant(lock, "scheduled", instant, 3600)).toBe(
    true,
  );

  await scheduler.tick(DUE);
  await scheduler.tick(new Date("2026-06-12T14:02:30.000Z"));
  expect(firer.jobs).toHaveLength(0);
});
