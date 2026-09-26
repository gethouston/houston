import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Activity, Routine, RoutineRun } from "@houston/engine-adapter";
import {
  teamRoutineDrafts,
  teamRoutinesList,
} from "../src/components/team-view/team-routines-model.ts";

const routine = (id: string, extra: Partial<Routine> = {}): Routine =>
  ({ id, name: id, enabled: true, schedule: "0 9 * * *", ...extra }) as Routine;

const run = (id: string, routineId: string, startedAt: string): RoutineRun =>
  ({ id, routine_id: routineId, started_at: startedAt }) as RoutineRun;

const SETUP = "houston:routine-setup";

const activity = (id: string, extra: Partial<Activity> = {}): Activity =>
  ({
    id,
    title: "New routine",
    description: "",
    status: "active",
    agent: SETUP,
    ...extra,
  }) as Activity;

describe("teamRoutinesList", () => {
  it("keeps the employee's own routine ids and keys each latest run by them", () => {
    const list = teamRoutinesList(
      [routine("r1"), routine("r2")],
      [
        run("run-old", "r1", "2026-01-01T00:00:00Z"),
        run("run-new", "r1", "2026-02-01T00:00:00Z"),
      ],
    );
    assert.deepEqual(
      list.routines.map((r) => r.id),
      ["r1", "r2"],
    );
    assert.equal(list.lastRuns.r1?.id, "run-new");
    assert.equal(list.lastRuns.r2, undefined);
  });

  it("holds no rows while the reads have not answered", () => {
    const list = teamRoutinesList(undefined, undefined);
    assert.deepEqual(list.routines, []);
    assert.deepEqual(list.lastRuns, {});
  });
});

// A routine still being built in chat is not a routine yet: it is an unclaimed
// setup activity, and the list shows it as its own resumable row.
describe("teamRoutineDrafts", () => {
  it("lists unclaimed setup chats by their own activity ids", () => {
    const drafts = teamRoutineDrafts([activity("d-1"), activity("d-2")], []);
    assert.deepEqual(drafts, [{ id: "d-1" }, { id: "d-2" }]);
  });

  it("drops a chat a routine already claimed, in either link direction", () => {
    const drafts = teamRoutineDrafts(
      [
        activity("forward"),
        activity("reverse", { routine_id: "r-2" }),
        activity("still-a-draft"),
      ],
      [routine("r-1", { setup_activity_id: "forward" })],
    );
    assert.deepEqual(drafts, [{ id: "still-a-draft" }]);
  });

  it("ignores archived chats and anything that is not a setup chat", () => {
    const drafts = teamRoutineDrafts(
      [
        activity("discarded", { status: "archived" }),
        activity("a-mission", { agent: "" }),
        activity("legacy-reaction", { agent: "houston:reaction-setup" }),
      ],
      [],
    );
    assert.deepEqual(drafts, [{ id: "legacy-reaction" }]);
  });

  it("holds no rows while the activity read has not answered", () => {
    assert.deepEqual(teamRoutineDrafts(undefined, []), []);
  });
});
