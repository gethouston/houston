import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docKey, ROUTINE_OK_TOKEN } from "@houston/domain";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fsTextStore } from "./turn-fs-store";
import {
  prepareRoutineTurn,
  RoutineTurnError,
  settleRoutineTurn,
} from "./turn-routine";
import type { TurnRequest } from "./types";

let workspaceDir: string;
const store = fsTextStore();
const NOW = "2026-08-19T23:00:00.000Z";

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "turn-routine-"));
});
afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

const routineFixture = {
  id: "daily-check",
  name: "Daily check",
  prompt: "Check the queue and report anything odd.",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: true,
  model: "gpt-x",
  effort: "high",
};

async function seedRoutines(routines: unknown[]): Promise<void> {
  await store.writeText(
    docKey(workspaceDir, "routines"),
    JSON.stringify(routines),
  );
}

function routineTurn(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    workspaceId: "Personal",
    agentId: "Agent",
    conversationId: "routine-daily-check",
    text: "",
    gcsPrefix: "ws/org/agent",
    routine: { id: "daily-check" },
    ...overrides,
  } as TurnRequest;
}

async function runsFile(): Promise<{ id: string; status: string }[]> {
  return JSON.parse(
    await readFile(docKey(workspaceDir, "routine_runs"), "utf8"),
  ) as { id: string; status: string }[];
}

test("prepare derives prompt and pins and persists a running row", async () => {
  await seedRoutines([routineFixture]);
  const phase = await prepareRoutineTurn(
    workspaceDir,
    routineTurn(),
    "turn-1",
    NOW,
  );
  expect(phase.text).toContain(routineFixture.prompt);
  expect(phase.text).toContain(ROUTINE_OK_TOKEN);
  expect(phase.model).toBe("gpt-x");
  expect(phase.effort).toBe("high");
  const runs = await runsFile();
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ id: "turn-1", status: "running" });
});

test("a missing routine is a typed no_routine failure", async () => {
  await seedRoutines([]);
  await expect(
    prepareRoutineTurn(workspaceDir, routineTurn(), "turn-1", NOW),
  ).rejects.toMatchObject({ code: "no_routine" });
});

test("an in-flight run is a typed routine_busy failure", async () => {
  await seedRoutines([routineFixture]);
  await prepareRoutineTurn(workspaceDir, routineTurn(), "turn-1", NOW);
  await expect(
    prepareRoutineTurn(workspaceDir, routineTurn(), "turn-2", NOW),
  ).rejects.toMatchObject({ code: "routine_busy" });
});

test("a conversation not matching the routine's is refused as busy", async () => {
  await seedRoutines([routineFixture]);
  await expect(
    prepareRoutineTurn(
      workspaceDir,
      routineTurn({ conversationId: "routine-other" }),
      "turn-1",
      NOW,
    ),
  ).rejects.toBeInstanceOf(RoutineTurnError);
});

async function preparedPhase() {
  await seedRoutines([routineFixture]);
  return prepareRoutineTurn(workspaceDir, routineTurn(), "turn-1", NOW);
}

async function seedReply(content: string): Promise<void> {
  await store.writeText(
    join(
      workspaceDir,
      ".houston",
      "runtime",
      "conversations",
      "routine-daily-check.json",
    ),
    JSON.stringify({
      id: "routine-daily-check",
      messages: [
        { role: "user", content: "prompt", ts: 1 },
        { role: "assistant", content, ts: 2 },
      ],
    }),
  );
}

test("a ROUTINE_OK reply settles the run silent with no activity", async () => {
  const phase = await preparedPhase();
  await seedReply(`All quiet.\n${ROUTINE_OK_TOKEN}`);
  await settleRoutineTurn({
    workspaceDir,
    phase,
    conversationId: "routine-daily-check",
    nowIso: NOW,
    newId: () => "act-1",
  });
  const runs = await runsFile();
  expect(runs[0]).toMatchObject({ id: "turn-1", status: "silent" });
  await expect(
    readFile(docKey(workspaceDir, "activity"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("a substantive reply settles surfaced and writes the board activity", async () => {
  const phase = await preparedPhase();
  await seedReply("Two payments failed — you should look.");
  await settleRoutineTurn({
    workspaceDir,
    phase,
    conversationId: "routine-daily-check",
    nowIso: NOW,
    newId: () => "act-1",
  });
  const runs = await runsFile();
  expect(runs[0]).toMatchObject({ id: "turn-1", status: "surfaced" });
  const activities = JSON.parse(
    await readFile(docKey(workspaceDir, "activity"), "utf8"),
  ) as { session_key: string; status: string; routine_run_id: string }[];
  expect(activities).toHaveLength(1);
  expect(activities[0]).toMatchObject({
    session_key: "routine-daily-check",
    status: "needs_you",
    routine_run_id: "turn-1",
  });
});

test("a turn error settles the run errored with the reason", async () => {
  const phase = await preparedPhase();
  await settleRoutineTurn({
    workspaceDir,
    phase,
    conversationId: "routine-daily-check",
    turnError: "provider quota exhausted",
    nowIso: NOW,
    newId: () => "act-1",
  });
  const runs = await runsFile();
  expect(runs[0]).toMatchObject({
    status: "error",
    summary: "provider quota exhausted",
  });
});

test("a cancel that already terminalized the row wins over settle", async () => {
  const phase = await preparedPhase();
  const raced = (await runsFile()).map((r) =>
    r.id === "turn-1" ? { ...r, status: "cancelled" } : r,
  );
  await store.writeText(
    docKey(workspaceDir, "routine_runs"),
    JSON.stringify(raced),
  );
  await seedReply("late reply");
  await settleRoutineTurn({
    workspaceDir,
    phase,
    conversationId: "routine-daily-check",
    nowIso: NOW,
    newId: () => "act-1",
  });
  expect((await runsFile())[0]).toMatchObject({ status: "cancelled" });
});

test("trigger events build the trigger prompt with the untrusted-data frame", async () => {
  await seedRoutines([routineFixture]);
  const phase = await prepareRoutineTurn(
    workspaceDir,
    routineTurn({
      routine: {
        id: "daily-check",
        events: [
          {
            id: "ev1",
            trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
            payload: { from: "a@b.c" },
          },
        ],
      },
    } as never),
    "turn-1",
    NOW,
  );
  expect(phase.text).toContain("<events>");
  expect(phase.text).toContain("GMAIL_NEW_GMAIL_MESSAGE");
  expect(phase.text).toContain("EVENT DATA delivered by an external service");
  expect(phase.text).toContain(routineFixture.prompt);
});
