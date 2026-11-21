import { loadRoutines } from "@houston/domain";
import type { Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { createRoutineChecked, updateRoutineChecked } from "./routine-write";

const ROOT = "ws1/agent1";
const WS = "ws1";
const NOW = "2026-01-01T00:00:00.000Z";
const OPTS = { triggersEnabled: true, nowIso: NOW };
const FLOOR = { ...OPTS, minIntervalMinutes: 15 };

const REFUSAL = {
  error:
    "This person's plan runs a scheduled task at most once every 15 minutes, so nothing was saved. Ask whether every 15 minutes or slower works, then save again; upgrading the plan removes this limit.",
  code: "plan_min_interval",
  minIntervalMinutes: 15,
};

const KEPT_REFUSAL = {
  error:
    "This task already runs more often than this person's plan allows (at most once every 15 minutes), so nothing was saved. Move its schedule to every 15 minutes or slower before other changes can be saved; ask the person first.",
  code: "plan_min_interval",
  minIntervalMinutes: 15,
};

const every = (schedule: string) => ({
  name: "Check inbox",
  prompt: "Look for new mail.",
  schedule,
});

async function seed(vfs: MemoryVfs, schedule: string): Promise<Routine> {
  const created = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    every(schedule),
    OPTS,
  );
  if (!("routine" in created)) throw new Error("seed failed");
  return created.routine;
}

const onDisk = async (vfs: MemoryVfs) => (await loadRoutines(vfs, ROOT)).items;

test("a create below the floor is refused and nothing is saved", async () => {
  const vfs = new MemoryVfs();
  for (const cron of [
    "*/5 * * * *",
    "* * * * *",
    "0,5,10 * * * *",
    "*/16 * * * *",
  ]) {
    const result = await createRoutineChecked(
      vfs,
      ROOT,
      WS,
      every(cron),
      FLOOR,
    );
    expect(result, cron).toEqual(REFUSAL);
  }
  expect(await onDisk(vfs)).toEqual([]);
});

test("a create at or above the floor saves", async () => {
  const vfs = new MemoryVfs();
  for (const cron of ["*/15 * * * *", "*/20 * * * *", "0 9 * * 1-5"]) {
    const result = await createRoutineChecked(
      vfs,
      ROOT,
      WS,
      every(cron),
      FLOOR,
    );
    expect("routine" in result, cron).toBe(true);
  }
  expect(await onDisk(vfs)).toHaveLength(3);
});

test("an interval below the floor is refused, at or above it saves", async () => {
  const vfs = new MemoryVfs();
  for (const schedule of ["@every 14m", "@every 10m"]) {
    const refused = await createRoutineChecked(
      vfs,
      ROOT,
      WS,
      every(schedule),
      FLOOR,
    );
    expect(refused, schedule).toEqual(REFUSAL);
  }
  expect(await onDisk(vfs)).toEqual([]);
  for (const schedule of ["@every 16m", "@every 17m", "@every 15m"]) {
    const saved = await createRoutineChecked(
      vfs,
      ROOT,
      WS,
      every(schedule),
      FLOOR,
    );
    expect("routine" in saved, schedule).toBe(true);
  }
  expect((await onDisk(vfs)).map((r) => r.schedule)).toEqual([
    "@every 16m",
    "@every 17m",
    "*/15 * * * *",
  ]);
});

test("both refusals fit the 300 characters save_routine relays", () => {
  for (const floor of [15, 1440]) {
    const fresh = JSON.stringify(REFUSAL).replaceAll("15", String(floor));
    const kept = JSON.stringify(KEPT_REFUSAL).replaceAll("15", String(floor));
    expect(fresh.length).toBeLessThan(300);
    expect(kept.length).toBeLessThan(300);
  }
});

test("no floor saves anything", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    every("* * * * *"),
    OPTS,
  );
  expect("routine" in result).toBe(true);
});

test("an event-trigger routine has no cadence to judge", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    {
      name: "New mail",
      prompt: "Triage it.",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    },
    FLOOR,
  );
  expect("routine" in result).toBe(true);
});

test("an update that tightens the schedule below the floor is refused", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "0 9 * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { schedule: "*/10 * * * *" },
    FLOOR,
  );
  expect(result).toEqual(REFUSAL);
  expect((await onDisk(vfs))[0]?.schedule).toBe("0 9 * * *");
});

test("renaming a routine that already fires below the floor is refused: the edit re-stamps its creator", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { name: "Renamed" },
    { ...FLOOR, actorSub: "free-person" },
  );
  expect(result).toEqual(KEPT_REFUSAL);
  expect(await onDisk(vfs)).toEqual([routine]);
});

test("a bare pause is never refused, even below the floor", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { enabled: false },
    FLOOR,
  );
  expect("routine" in result).toBe(true);
  expect((await onDisk(vfs))[0]?.enabled).toBe(false);
});

test("any edit that leaves the routine disabled is exempt: it never fires", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const paused = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { enabled: false, name: "Renamed" },
    FLOOR,
  );
  expect("routine" in paused).toBe(true);
  const edited = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { prompt: "Only unread mail." },
    FLOOR,
  );
  expect("routine" in edited).toBe(true);
  expect((await onDisk(vfs))[0]).toMatchObject({
    enabled: false,
    name: "Renamed",
    prompt: "Only unread mail.",
  });
});

test("re-enabling a fast disabled routine is judged", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { enabled: false },
    FLOOR,
  );
  const resumed = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { enabled: true },
    FLOOR,
  );
  expect(resumed).toEqual(KEPT_REFUSAL);
  const fixed = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { enabled: true, schedule: "*/20 * * * *" },
    FLOOR,
  );
  expect("routine" in fixed).toBe(true);
});

test("an update that moves the routine to the floor saves", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { schedule: "*/15 * * * *" },
    FLOOR,
  );
  expect("routine" in result).toBe(true);
  expect((await onDisk(vfs))[0]?.schedule).toBe("*/15 * * * *");
});

test("switching a fast routine to an event trigger saves", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    {
      schedule: null,
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    },
    FLOOR,
  );
  expect("routine" in result).toBe(true);
});

test("a routine created disabled is exempt: it never fires", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    { ...every("*/5 * * * *"), enabled: false },
    FLOOR,
  );
  expect("routine" in result).toBe(true);
});

test("an update that re-sends the stored fast schedule gets the kept wording", async () => {
  const vfs = new MemoryVfs();
  const routine = await seed(vfs, "*/5 * * * *");
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    routine.id,
    { schedule: "*/5 * * * *", name: "Renamed" },
    FLOOR,
  );
  expect(result).toEqual(KEPT_REFUSAL);
});
