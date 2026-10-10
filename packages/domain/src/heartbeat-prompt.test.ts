import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import { heartbeatPrompt } from "./heartbeat-prompt";
import {
  buildHeartbeatSnapshot,
  HEARTBEAT_SECTION_CAP,
  type HeartbeatAgentData,
  isHeartbeatSnapshotEmpty,
} from "./heartbeat-snapshot";

const SINCE = Date.parse("2026-10-09T08:00:00Z");

const activity = (over: Partial<Activity>): Activity => ({
  id: "a",
  title: "Mission",
  description: "",
  status: "running",
  ...over,
});

const routine = (over: Partial<Routine>): Routine =>
  ({
    id: "r1",
    name: "Daily report",
    prompt: "p",
    schedule: "0 9 * * *",
    enabled: true,
    suppress_when_silent: false,
    ...over,
  }) as Routine;

const run = (over: Partial<RoutineRun>): RoutineRun => ({
  id: "run",
  routine_id: "r1",
  status: "error",
  session_key: "routine-r1",
  started_at: "2026-10-10T07:00:00Z",
  ...over,
});

const agent = (over: Partial<HeartbeatAgentData>): HeartbeatAgentData => ({
  agentName: "Ana",
  activities: [],
  routines: [],
  runs: [],
  ...over,
});

describe("snapshot", () => {
  test("nothing worth saying is empty", () => {
    const snapshot = buildHeartbeatSnapshot(
      [
        agent({
          activities: [
            activity({ status: "running" }),
            activity({ status: "done", updated_at: "2026-10-01T00:00:00Z" }),
          ],
          routines: [routine({})],
          runs: [
            run({ status: "silent" }),
            run({ started_at: "2026-10-01T00:00:00Z" }),
          ],
        }),
      ],
      SINCE,
    );
    expect(isHeartbeatSnapshotEmpty(snapshot)).toBe(true);
  });

  test("collects waiting missions, failed runs, paused routines and done work", () => {
    const snapshot = buildHeartbeatSnapshot(
      [
        agent({
          activities: [
            activity({
              id: "w",
              title: "Invoice",
              status: "needs_you",
              pending_interaction: {
                steps: [
                  { kind: "suggest_actions", id: "s", actions: [] },
                  { kind: "connect", id: "c", toolkit: "gmail" },
                ],
              },
            }),
            activity({
              title: "Report",
              status: "done",
              updated_at: "2026-10-10T06:00:00Z",
            }),
          ],
          routines: [
            routine({}),
            routine({
              id: "r2",
              name: "Sync",
              enabled: false,
              auto_paused: {
                reason: "team_not_connected",
                provider: "anthropic",
                failures: 10,
                at: "x",
              },
            }),
          ],
          runs: [run({ summary: "quota" })],
        }),
      ],
      SINCE,
    );
    expect(snapshot.needsYou.items).toEqual([
      { agent: "Ana", title: "Invoice", waitingOn: "connect" },
    ]);
    expect(snapshot.routineRuns.items).toEqual([
      {
        agent: "Ana",
        routine: "Daily report",
        status: "error",
        summary: "quota",
        at: "2026-10-10T07:00:00Z",
      },
    ]);
    expect(snapshot.pausedRoutines.items).toEqual([
      { agent: "Ana", routine: "Sync", failures: 10 },
    ]);
    expect(snapshot.done.items).toEqual([{ agent: "Ana", title: "Report" }]);
  });

  test("a surfaced run whose card already waits is named once", () => {
    const snapshot = buildHeartbeatSnapshot(
      [
        agent({
          activities: [activity({ id: "card", status: "needs_you" })],
          routines: [routine({})],
          runs: [run({ status: "surfaced", activity_id: "card" })],
        }),
      ],
      SINCE,
    );
    expect(snapshot.needsYou.items).toHaveLength(1);
    expect(snapshot.routineRuns.items).toHaveLength(0);
  });

  test("caps each section and counts the rest", () => {
    const activities = Array.from(
      { length: HEARTBEAT_SECTION_CAP + 5 },
      (_, i) => activity({ id: `a${i}`, status: "needs_you" }),
    );
    const snapshot = buildHeartbeatSnapshot([agent({ activities })], SINCE);
    expect(snapshot.needsYou.items).toHaveLength(HEARTBEAT_SECTION_CAP);
    expect(snapshot.needsYou.more).toBe(5);
  });
});

describe("prompt", () => {
  const snapshot = buildHeartbeatSnapshot(
    [
      agent({
        activities: [
          activity({
            title: "Invoice",
            status: "needs_you",
            pending_interaction: {
              steps: [{ kind: "signin", id: "s" }],
            },
          }),
        ],
      }),
    ],
    SINCE,
  );
  const prompt = heartbeatPrompt({
    localDate: "2026-10-10",
    localTime: "08:00",
    timezone: "Europe/Madrid",
    snapshot,
  });

  test("carries the local date, the zone and the snapshot", () => {
    expect(prompt).toContain("2026-10-10, 08:00");
    expect(prompt).toContain("Europe/Madrid");
    expect(prompt).toContain('Ana: "Invoice" (waiting on a sign-in)');
    expect(prompt).not.toContain("Finished since the last briefing");
  });

  test("forbids acting and asks for suggest_actions", () => {
    expect(prompt).toContain("Do NOT start, retry");
    expect(prompt).toContain("suggest_actions");
  });

  // The host fires only on a non-empty snapshot and has already pinged the
  // person, so a silent "nothing to say" token would land raw in the chat.
  test("always asks for a briefing, never a silent token", () => {
    expect(prompt).not.toContain("HEARTBEAT_OK");
    expect(prompt).not.toMatch(/reply with exactly/i);
  });

  test("never contains an em dash", () => {
    expect(prompt).not.toContain("—");
  });
});
