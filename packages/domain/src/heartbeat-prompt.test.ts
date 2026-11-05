import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import { heartbeatPrompt } from "./heartbeat-prompt";
import { HEARTBEAT_SECTION_CAP } from "./heartbeat-sections";
import {
  buildHeartbeatSnapshot,
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
  agentId: "Personal/Ana",
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
  const input = {
    localDate: "2026-10-10",
    localTime: "08:00",
    timezone: "Europe/Madrid",
    snapshot,
  };
  const prompt = heartbeatPrompt(input);

  test("the enabled prompt stays byte-identical", () => {
    expect(prompt).toMatchInlineSnapshot(`
      "This is your automatic morning check-in. The person did not type this message. It is 2026-10-10, 08:00 where they live (Europe/Madrid).

      Write them a short morning briefing about their team:
      1. Open with what needs their attention first, naming the AI Employee each item belongs to.
      2. Then summarize, briefly, what got done.
      3. Use plain, warm, non-technical language and keep it short. Write in the language the person usually uses with you.
      4. Do NOT start, retry, pause or change anything yourself. This is a report, not a to-do list you act on.
      5. End with suggest_actions offering to hand the top items to the right AI Employee (for example, to retry a failed routine or to answer a waiting question).

      You may use your read-only tools (list_agents, list_missions, houston_call for listRoutineRuns or integrationStatus) to check details before you write.

      What Houston saw since the last briefing:

      Waiting on the person:
      - Ana: "Invoice" (waiting on a sign-in)"
    `);
    expect(heartbeatPrompt({ ...input, nextStepSuggestions: true })).toBe(
      prompt,
    );
  });

  test("off closes in words without naming the unavailable tool", () => {
    const off = heartbeatPrompt({ ...input, nextStepSuggestions: false });
    expect(off).not.toContain("suggest_actions");
    expect(off).toContain(
      "5. End with a short closing line offering to hand the top items to the right AI Employee.",
    );
    expect(off.match(/^\d\. /gm)).toEqual(["1. ", "2. ", "3. ", "4. ", "5. "]);
  });

  test("an earlier suggestion offer is described without its tool name", () => {
    const off = heartbeatPrompt({
      ...input,
      nextStepSuggestions: false,
      snapshot: {
        ...snapshot,
        needsYou: {
          items: [
            {
              agent: "Assistant",
              title: "Report",
              waitingOn: "suggest_actions",
            },
          ],
          more: 0,
        },
      },
    });
    expect(off).toContain('Assistant: "Report" (offering next steps)');
    expect(off).not.toContain("suggest_actions");
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
