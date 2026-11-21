import { createRoutine, saveRoutines, setPreference } from "@houston/domain";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { workspaceRoot } from "../routes/agent-data";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryVfs } from "../vfs";
import { type FiringJob, type RoutineFirer, Scheduler } from "./scheduler";

class CaptureFirer implements RoutineFirer {
  fired: { routineId: string; at: string }[] = [];
  constructor(private readonly clock: () => Date) {}
  async fire(job: FiringJob): Promise<void> {
    this.fired.push({
      routineId: job.routine.id,
      at: this.clock().toISOString(),
    });
  }
}

test("an @every 16m routine fires at 13:04 while */16 fires at 13:00", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "A" });
  await setPreference(vfs, ws.id, "timezone", "America/Bogota");
  const created = "2026-06-12T00:00:00.000Z";
  await saveRoutines(vfs, workspaceRoot(ws, agent), [
    createRoutine(
      { name: "I", prompt: "p", schedule: "@every 16m" },
      "interval",
      created,
    ),
    createRoutine(
      { name: "C", prompt: "p", schedule: "*/16 * * * *" },
      "cron",
      created,
    ),
  ]);

  let clock = new Date("2026-06-12T12:48:30.000Z");
  const firer = new CaptureFirer(() => clock);
  let id = 0;
  const scheduler = new Scheduler({
    store,
    vfs,
    paths: new CloudPaths(),
    lock: new MemoryTurnBus(),
    firer,
    now: () => clock,
    newId: () => `run-${++id}`,
  });

  const end = new Date("2026-06-12T13:05:00.000Z").getTime();
  while (clock.getTime() < end) {
    clock = new Date(clock.getTime() + 30_000);
    await scheduler.tick(clock);
  }

  expect(firer.fired).toEqual([
    { routineId: "cron", at: "2026-06-12T13:00:00.000Z" },
    { routineId: "interval", at: "2026-06-12T13:04:00.000Z" },
  ]);
});
