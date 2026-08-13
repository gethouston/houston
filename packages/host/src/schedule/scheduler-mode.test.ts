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
