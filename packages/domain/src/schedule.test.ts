import { test, expect } from "bun:test";
import type { Routine } from "@houston/protocol";
import { createRoutine } from "./routines";
import { createRoutineRun, dueAt, nextRun, routineConversationId, validateSchedule } from "./schedule";

const NOW = "2026-06-12T12:00:00.000Z";

function routine(over: Partial<Routine> = {}): Routine {
  return { ...createRoutine({ name: "R", prompt: "p", schedule: "0 9 * * 1-5" }, "r1", NOW), ...over };
}

test("validateSchedule accepts good patterns and rejects junk", () => {
  expect(validateSchedule("0 9 * * 1-5")).toBeNull();
  expect(validateSchedule("*/15 * * * *", "America/Bogota")).toBeNull();
  expect(validateSchedule("not a cron")).not.toBeNull();
  expect(validateSchedule("0 9 * * 1-5", "Mars/Phobos")).not.toBeNull();
});

test("nextRun is timezone-aware: 9am Bogota is 14:00 UTC (UTC-5)", () => {
  // Friday 08:00 Bogota → next 09:00 Bogota = 14:00 UTC same day.
  const after = new Date("2026-06-12T13:00:00.000Z");
  const n = nextRun("0 9 * * 1-5", "America/Bogota", after);
  expect(n?.toISOString()).toBe("2026-06-12T14:00:00.000Z");
});

test("nextRun without tz uses cron semantics in the host's local zone", () => {
  const n = nextRun("0 0 * * *", null, new Date("2026-06-12T05:00:00.000Z"));
  expect(n).not.toBeNull();
});

test("dueAt fires when a scheduled instant falls in (since, now]", () => {
  const r = routine({ schedule: "0 14 * * *", timezone: null }); // 14:00 UTC daily
  const since = new Date("2026-06-12T13:59:00.000Z");
  const now = new Date("2026-06-12T14:00:30.000Z");
  const at = dueAt(r, since, now);
  expect(at?.toISOString()).toBe("2026-06-12T14:00:00.000Z");
});

test("dueAt returns null when the next fire-time is still in the future", () => {
  const r = routine({ schedule: "0 14 * * *", timezone: null });
  const since = new Date("2026-06-12T10:00:00.000Z");
  const now = new Date("2026-06-12T10:05:00.000Z");
  expect(dueAt(r, since, now)).toBeNull();
});

test("dueAt never fires a disabled routine", () => {
  const r = routine({ schedule: "* * * * *", enabled: false });
  expect(dueAt(r, new Date(NOW), new Date("2026-06-12T12:05:00.000Z"))).toBeNull();
});

test("dueAt returns the FIRST missed instant (one catch-up, deterministic across replicas)", () => {
  // Hourly routine; scheduler was down 12:00→15:30. The first missed instant is
  // 13:00 (since 12:30), the same value any replica computes → safe dedup key.
  const r = routine({ schedule: "0 * * * *", timezone: null });
  const since = new Date("2026-06-12T12:30:00.000Z");
  const now = new Date("2026-06-12T15:30:00.000Z");
  expect(dueAt(r, since, now)?.toISOString()).toBe("2026-06-12T13:00:00.000Z");
});

test("routineConversationId: shared reuses one chat, per_run is unique per run", () => {
  const shared = routine({ chat_mode: "shared" });
  expect(routineConversationId(shared, "run-1")).toBe("routine-r1");
  expect(routineConversationId(shared, "run-2")).toBe("routine-r1");

  const perRun = routine({ chat_mode: "per_run" });
  expect(routineConversationId(perRun, "run-1")).toBe("routine-r1-run-1");
  expect(routineConversationId(perRun, "run-2")).toBe("routine-r1-run-2");
});

test("createRoutineRun starts as running with the run's conversation as session_key", () => {
  const run = createRoutineRun(routine({ chat_mode: "per_run" }), "run-9", NOW);
  expect(run).toMatchObject({
    id: "run-9",
    routine_id: "r1",
    status: "running",
    session_key: "routine-r1-run-9",
    started_at: NOW,
  });
});
