import { expect, test } from "bun:test";
import type { Routine } from "@houston/protocol";
import { createRoutine } from "./routines";
import {
  completeRoutineRun,
  createRoutineRun,
  dueAt,
  extractRunSummary,
  nextRun,
  responseIsSilent,
  routineConversationId,
  routinePrompt,
  SUPPRESSION_INSTRUCTION,
  validateSchedule,
} from "./schedule";

const NOW = "2026-06-12T12:00:00.000Z";

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine(
      { name: "R", prompt: "p", schedule: "0 9 * * 1-5" },
      "r1",
      NOW,
    ),
    ...over,
  };
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
  const r = routine({ schedule: "0 14 * * *" }); // 14:00 daily
  const since = new Date("2026-06-12T13:59:00.000Z");
  const now = new Date("2026-06-12T14:00:30.000Z");
  const at = dueAt(r, since, now, "UTC");
  expect(at?.toISOString()).toBe("2026-06-12T14:00:00.000Z");
});

test("dueAt evaluates the schedule in the account-wide timezone, not UTC", () => {
  // The routine has no zone of its own; the driver passes the single
  // account-wide zone. 9am Bogota (UTC-5) is 14:00 UTC, so the 14:00 instant is
  // due — while the same routine/window is NOT due when read as 9am UTC.
  const r = routine({ schedule: "0 9 * * *" });
  const since = new Date("2026-06-12T13:59:00.000Z");
  const now = new Date("2026-06-12T14:00:30.000Z");
  expect(dueAt(r, since, now, "America/Bogota")?.toISOString()).toBe(
    "2026-06-12T14:00:00.000Z",
  );
  expect(dueAt(r, since, now, "UTC")).toBeNull();
});

test("dueAt returns null when the next fire-time is still in the future", () => {
  const r = routine({ schedule: "0 14 * * *" });
  const since = new Date("2026-06-12T10:00:00.000Z");
  const now = new Date("2026-06-12T10:05:00.000Z");
  expect(dueAt(r, since, now, "UTC")).toBeNull();
});

test("dueAt never fires a disabled routine", () => {
  const r = routine({ schedule: "* * * * *", enabled: false });
  expect(
    dueAt(r, new Date(NOW), new Date("2026-06-12T12:05:00.000Z"), "UTC"),
  ).toBeNull();
});

test("dueAt returns the FIRST missed instant (one catch-up, deterministic across replicas)", () => {
  // Hourly routine; scheduler was down 12:00→15:30. The first missed instant is
  // 13:00 (since 12:30), the same value any replica computes → safe dedup key.
  const r = routine({ schedule: "0 * * * *" });
  const since = new Date("2026-06-12T12:30:00.000Z");
  const now = new Date("2026-06-12T15:30:00.000Z");
  expect(dueAt(r, since, now, "UTC")?.toISOString()).toBe(
    "2026-06-12T13:00:00.000Z",
  );
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

// --- run completion (parity with runner.rs) ---

test("routinePrompt appends the suppression instruction only when suppress_when_silent", () => {
  expect(
    routinePrompt(routine({ prompt: "do it", suppress_when_silent: false })),
  ).toBe("do it");
  const suppressed = routinePrompt(
    routine({ prompt: "check email", suppress_when_silent: true }),
  );
  expect(suppressed).toBe(`check email${SUPPRESSION_INSTRUCTION}`);
  expect(suppressed).toContain('"ROUTINE_OK"');
});

test("responseIsSilent matches the token at start or end, trimmed, case-sensitive", () => {
  expect(responseIsSilent("ROUTINE_OK")).toBe(true);
  expect(responseIsSilent("  all good\nROUTINE_OK  ")).toBe(true); // ends_with, trimmed
  expect(responseIsSilent("ROUTINE_OK\nnothing happened")).toBe(true); // starts_with
  expect(
    responseIsSilent("the word ROUTINE_OK appears mid-sentence here"),
  ).toBe(false); // substring only
  expect(responseIsSilent("routine_ok")).toBe(false); // case-sensitive
  expect(responseIsSilent("the report is ready")).toBe(false);
});

test("extractRunSummary strips the token, falls back to 'Nothing to report', truncates at 200", () => {
  expect(extractRunSummary("ROUTINE_OK")).toBe("Nothing to report");
  expect(extractRunSummary("Found 3 issues.\nROUTINE_OK")).toBe(
    "Found 3 issues.",
  );
  const long = "x".repeat(250);
  const summary = extractRunSummary(long);
  expect([...summary].length).toBe(200);
  expect(summary.endsWith("…")).toBe(true);
});

test("completeRoutineRun → silent when suppressed and the agent emitted the token", () => {
  const r = routine({ suppress_when_silent: true });
  const run = createRoutineRun(r, "run-1", NOW);
  const done = completeRoutineRun(
    run,
    r,
    "all quiet\nROUTINE_OK",
    "2026-06-12T12:01:00.000Z",
  );
  expect(done.status).toBe("silent");
  expect(done.summary).toBe("all quiet");
  expect(done.completed_at).toBe("2026-06-12T12:01:00.000Z");
});

test("completeRoutineRun → surfaced when the agent reports findings", () => {
  const r = routine({ suppress_when_silent: true });
  const run = createRoutineRun(r, "run-1", NOW);
  const done = completeRoutineRun(
    run,
    r,
    "The deploy failed on staging.",
    "2026-06-12T12:01:00.000Z",
  );
  expect(done.status).toBe("surfaced");
  expect(done.summary).toBe("The deploy failed on staging.");
});

test("completeRoutineRun → surfaced even with the token when suppress_when_silent is off", () => {
  const r = routine({ suppress_when_silent: false });
  const run = createRoutineRun(r, "run-1", NOW);
  const done = completeRoutineRun(run, r, "ROUTINE_OK", NOW);
  expect(done.status).toBe("surfaced"); // both conditions required for silent
});
