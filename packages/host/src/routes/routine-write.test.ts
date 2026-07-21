import { loadRoutines } from "@houston/domain";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { createRoutineChecked, updateRoutineChecked } from "./routine-write";

/**
 * The merge-safe scheduled-task write path shared by the agent-data route and
 * the runtime save_routine tool. The bug it fixes: two isolated setup chats each
 * knew only their own routine, so a wholesale write of the second deleted the
 * first. These tests prove the read-modify-write keeps both, updates in place,
 * and holds the wake + trigger-backend gates.
 */

const ROOT = "ws1/agent1";
const WS = "ws1";
const OPTS = { triggersEnabled: false, nowIso: "2026-01-01T00:00:00.000Z" };

const daily = (name: string) => ({
  name,
  prompt: `run ${name}`,
  schedule: "0 9 * * *",
});

test("creating a second task keeps the first (merge-safe, not a wholesale write)", async () => {
  const vfs = new MemoryVfs();
  const a = await createRoutineChecked(vfs, ROOT, WS, daily("A"), OPTS);
  const b = await createRoutineChecked(vfs, ROOT, WS, daily("B"), OPTS);
  expect("routine" in a && "routine" in b).toBe(true);

  const { items } = await loadRoutines(vfs, ROOT);
  expect(items.map((r) => r.name).sort()).toEqual(["A", "B"]);
  expect(new Set(items.map((r) => r.id)).size).toBe(2);
});

test("updating by id changes that task in place and touches no other", async () => {
  const vfs = new MemoryVfs();
  const a = await createRoutineChecked(vfs, ROOT, WS, daily("A"), OPTS);
  await createRoutineChecked(vfs, ROOT, WS, daily("B"), OPTS);
  if (!("routine" in a)) throw new Error("setup failed");

  const updated = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    a.routine.id,
    { prompt: "run A revised" },
    OPTS,
  );
  expect("routine" in updated).toBe(true);

  const { items } = await loadRoutines(vfs, ROOT);
  expect(items).toHaveLength(2);
  const reloaded = items.find((r) => r.id === a.routine.id);
  expect(reloaded?.prompt).toBe("run A revised");
  expect(items.find((r) => r.name === "B")?.prompt).toBe("run B");
});

test("updating a missing id reports notFound (never creates a stray task)", async () => {
  const vfs = new MemoryVfs();
  const result = await updateRoutineChecked(
    vfs,
    ROOT,
    WS,
    "does-not-exist",
    { prompt: "x" },
    OPTS,
  );
  expect(result).toEqual({ notFound: true });
  const { items } = await loadRoutines(vfs, ROOT);
  expect(items).toHaveLength(0);
});

test("rejects a task with BOTH a schedule and a trigger", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    {
      name: "both",
      prompt: "p",
      schedule: "0 9 * * *",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    },
    { triggersEnabled: true, nowIso: OPTS.nowIso },
  );
  expect(result).toEqual({
    error: "a routine needs exactly one of 'schedule' or 'trigger'",
  });
  expect((await loadRoutines(vfs, ROOT)).items).toHaveLength(0);
});

test("rejects a task with NEITHER a schedule nor a trigger", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    { name: "neither", prompt: "p" },
    OPTS,
  );
  expect(result).toEqual({
    error: "a routine needs exactly one of 'schedule' or 'trigger'",
  });
});

test("rejects a trigger task where event triggers are unavailable", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    {
      name: "watch",
      prompt: "p",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    },
    { triggersEnabled: false, nowIso: OPTS.nowIso },
  );
  expect(result).toEqual({
    error:
      "Event triggers are not available here. Give this automation a schedule instead.",
  });
});

test("accepts a trigger task where the deployment can fire it", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    {
      name: "watch",
      prompt: "p",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    },
    { triggersEnabled: true, nowIso: OPTS.nowIso },
  );
  expect("routine" in result).toBe(true);
});

test("rejects a malformed cron before it can silently never fire", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    { name: "bad", prompt: "p", schedule: "not a cron" },
    OPTS,
  );
  expect(
    "error" in result && result.error.startsWith("invalid schedule:"),
  ).toBe(true);
});

test("stamps setup_activity_id and created_by when supplied", async () => {
  const vfs = new MemoryVfs();
  const result = await createRoutineChecked(
    vfs,
    ROOT,
    WS,
    { ...daily("A"), setup_activity_id: "act-42" },
    { ...OPTS, createdBy: "user-7" },
  );
  if (!("routine" in result)) throw new Error("expected success");
  expect(result.routine.setup_activity_id).toBe("act-42");
  expect(result.routine.created_by).toBe("user-7");

  const { items } = await loadRoutines(vfs, ROOT);
  expect(items[0]?.setup_activity_id).toBe("act-42");
});
