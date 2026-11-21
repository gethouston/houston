import { loadRoutines } from "@houston/domain";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { createRoutineChecked, updateRoutineChecked } from "./routine-write";

const ROOT = "ws1/agent1";
const WS = "ws1";
const OPTS = { triggersEnabled: false, nowIso: "2026-01-01T00:00:00.000Z" };

const create = (vfs: MemoryVfs, schedule: string) =>
  createRoutineChecked(
    vfs,
    ROOT,
    WS,
    { name: "R", prompt: "p", schedule },
    OPTS,
  );

test.each([
  ["@every 30m", "*/30 * * * *"],
  ["@every 2h", "0 */2 * * *"],
  ["@every 60m", "0 * * * *"],
  ["@every 1440m", "0 */24 * * *"],
  ["@every 24h", "0 */24 * * *"],
  ["@every 16m", "@every 16m"],
  ["@every 5h", "@every 5h"],
  ["*/16 * * * *", "*/16 * * * *"],
])("create stores %s as %s", async (sent, stored) => {
  const vfs = new MemoryVfs();
  const result = await create(vfs, sent);
  if (!("routine" in result)) throw new Error(JSON.stringify(result));
  expect(result.routine.schedule).toBe(stored);
  const { items } = await loadRoutines(vfs, ROOT);
  expect(items[0]?.schedule).toBe(stored);
});

test.each([
  "@every 1h30m",
  "@every 0m",
  "@every 10081m",
  "@every 169h",
])("create refuses %s", async (schedule) => {
  const vfs = new MemoryVfs();
  const result = await create(vfs, schedule);
  expect("error" in result && result.error).toMatch(/^invalid schedule: /);
  expect((await loadRoutines(vfs, ROOT)).items).toEqual([]);
});

test("update canonicalizes the applied schedule and refuses a bad interval", async () => {
  const vfs = new MemoryVfs();
  const created = await create(vfs, "0 9 * * *");
  if (!("routine" in created)) throw new Error("setup failed");
  const id = created.routine.id;

  const even = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    id,
    { schedule: "@every 15m" },
    OPTS,
  );
  expect("routine" in even && even.routine.schedule).toBe("*/15 * * * *");

  const uneven = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    id,
    { schedule: "@every 16m" },
    OPTS,
  );
  expect("routine" in uneven && uneven.routine.schedule).toBe("@every 16m");

  const bad = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    id,
    { schedule: "@every 1h30m" },
    OPTS,
  );
  expect("error" in bad && bad.error).toMatch(/^invalid schedule: /);
  const { items } = await loadRoutines(vfs, ROOT);
  expect(items[0]?.schedule).toBe("@every 16m");
});
