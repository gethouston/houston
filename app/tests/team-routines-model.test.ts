import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Routine, RoutineRun } from "@houston-ai/engine-client";
import {
  aggregateTeamRoutines,
  parseTeamRoutineKey,
  teamRoutineKey,
  teamTriggerRoutineIds,
  teamTriggerStatusItems,
} from "../src/components/team-view/team-routines-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string, name = id): Agent =>
  ({ id, name, folderPath: `/w/${id}` }) as Agent;

const routine = (id: string, name: string, enabled = true): Routine =>
  ({ id, name, enabled, schedule: "0 9 * * *" }) as Routine;

const run = (id: string, routineId: string, startedAt: string): RoutineRun =>
  ({ id, routine_id: routineId, started_at: startedAt }) as RoutineRun;

describe("teamRoutineKey", () => {
  it("round-trips an owner and a routine", () => {
    const key = teamRoutineKey("agent-1", "routine-7");
    assert.deepEqual(parseTeamRoutineKey(key), {
      agentId: "agent-1",
      routineId: "routine-7",
    });
  });

  it("keeps routine ids that contain the separator intact", () => {
    const key = teamRoutineKey("a", "weird::id");
    assert.deepEqual(parseTeamRoutineKey(key), {
      agentId: "a",
      routineId: "weird::id",
    });
  });

  it("refuses anything that is not a row key", () => {
    assert.equal(parseTeamRoutineKey("routine-1"), null);
    assert.equal(parseTeamRoutineKey("::routine-1"), null);
    assert.equal(parseTeamRoutineKey("agent-1::"), null);
  });
});

describe("aggregateTeamRoutines", () => {
  it("merges every agent's routines into one list, enabled first then by name", () => {
    const list = aggregateTeamRoutines([
      {
        agent: agent("a", "Ana"),
        routines: [
          routine("r1", "Weekly report"),
          routine("r2", "Backup", false),
        ],
        runs: undefined,
      },
      {
        agent: agent("b", "Bo"),
        routines: [routine("r1", "Daily digest")],
        runs: undefined,
      },
    ]);
    assert.deepEqual(
      list.routines.map((r) => r.name),
      ["Daily digest", "Weekly report", "Backup"],
    );
  });

  it("breaks a name tie by owner, so the order never depends on who answered first", () => {
    const rows = (order: Agent[]) =>
      aggregateTeamRoutines(
        order.map((a) => ({
          agent: a,
          routines: [routine("r1", "Same name")],
          runs: undefined,
        })),
      ).routines.map((r) => parseTeamRoutineKey(r.id)?.agentId);

    const ana = agent("a", "Ana");
    const bo = agent("b", "Bo");
    assert.deepEqual(rows([ana, bo]), ["a", "b"]);
    assert.deepEqual(rows([bo, ana]), ["a", "b"]);
  });

  it("keeps two agents' identically-numbered routines apart", () => {
    const list = aggregateTeamRoutines([
      {
        agent: agent("a", "Ana"),
        routines: [routine("r1", "One")],
        runs: undefined,
      },
      {
        agent: agent("b", "Bo"),
        routines: [routine("r1", "Two")],
        runs: undefined,
      },
    ]);
    assert.equal(list.routines.length, 2);
    assert.equal(new Set(list.routines.map((r) => r.id)).size, 2);
    assert.equal(list.ownerOf[teamRoutineKey("a", "r1")].name, "Ana");
    assert.equal(list.ownerOf[teamRoutineKey("b", "r1")].name, "Bo");
    assert.equal(list.routineIdOf[teamRoutineKey("b", "r1")], "r1");
  });

  it("keys each owner's latest run by the row it belongs to", () => {
    const list = aggregateTeamRoutines([
      {
        agent: agent("a", "Ana"),
        routines: [routine("r1", "One")],
        runs: [
          run("run-old", "r1", "2026-01-01T00:00:00Z"),
          run("run-new", "r1", "2026-02-01T00:00:00Z"),
        ],
      },
      {
        agent: agent("b", "Bo"),
        routines: [routine("r1", "Two")],
        runs: [run("run-b", "r1", "2026-01-15T00:00:00Z")],
      },
    ]);
    assert.equal(list.lastRuns[teamRoutineKey("a", "r1")].id, "run-new");
    assert.equal(list.lastRuns[teamRoutineKey("b", "r1")].id, "run-b");
  });

  it("treats an agent that has not answered as contributing nothing, not as an error", () => {
    const list = aggregateTeamRoutines([
      { agent: agent("a", "Ana"), routines: undefined, runs: undefined },
      {
        agent: agent("b", "Bo"),
        routines: [routine("r1", "One")],
        runs: undefined,
      },
    ]);
    assert.deepEqual(
      list.routines.map((r) => r.name),
      ["One"],
    );
  });
});

const eventRoutine = (id: string, name: string, toolkit = "gmail"): Routine =>
  ({
    id,
    name,
    enabled: true,
    trigger: { toolkit, trigger_slug: "X", trigger_config: {} },
  }) as Routine;

describe("teamTriggerRoutineIds", () => {
  it("groups each owner's event routines back into that owner's id space", () => {
    const list = aggregateTeamRoutines([
      {
        agent: agent("a", "Ana"),
        routines: [eventRoutine("r1", "Inbox"), routine("r2", "Nightly")],
        runs: undefined,
      },
      {
        agent: agent("b", "Bo"),
        routines: [eventRoutine("r1", "Alerts", "slack")],
        runs: undefined,
      },
    ]);
    assert.deepEqual(teamTriggerRoutineIds(list), { a: ["r1"], b: ["r1"] });
  });

  it("leaves out an agent with no event routine, so it is never asked", () => {
    const list = aggregateTeamRoutines([
      {
        agent: agent("a", "Ana"),
        routines: [routine("r1", "Nightly")],
        runs: undefined,
      },
      {
        agent: agent("b", "Bo"),
        routines: [eventRoutine("r9", "Alerts")],
        runs: undefined,
      },
    ]);
    const ids = teamTriggerRoutineIds(list);
    assert.equal(ids.a, undefined);
    assert.deepEqual(ids.b, ["r9"]);
  });

  it("asks nothing at all for a team whose lists have not answered", () => {
    const list = aggregateTeamRoutines([
      { agent: agent("a", "Ana"), routines: undefined, runs: undefined },
    ]);
    assert.deepEqual(teamTriggerRoutineIds(list), {});
  });
});

describe("teamTriggerStatusItems", () => {
  it("re-keys each owner's status onto the row the grid renders", () => {
    const items = teamTriggerStatusItems([
      { agentId: "a", items: [{ routine_id: "r1", status: "active" }] },
      {
        agentId: "b",
        items: [{ routine_id: "r1", status: "error", detail: "boom" }],
      },
    ]);
    assert.deepEqual(items, [
      { routine_id: teamRoutineKey("a", "r1"), status: "active" },
      {
        routine_id: teamRoutineKey("b", "r1"),
        status: "error",
        detail: "boom",
      },
    ]);
  });

  it("contributes nothing for an unanswered or trigger-less host", () => {
    // `null` (the host serves no triggers) and `undefined` (still reading) must
    // stay ABSENT: absence is what the verification timeout resolves, and a
    // synthesized status here would be exactly the lie it guards against.
    assert.deepEqual(
      teamTriggerStatusItems([
        { agentId: "a", items: null },
        { agentId: "b", items: undefined },
        { agentId: "c", items: [] },
      ]),
      [],
    );
  });
});
