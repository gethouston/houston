import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Activity, Routine } from "@houston-ai/engine-client";
import { aggregateTeamRoutineDrafts } from "../src/components/team-view/team-routine-drafts-model.ts";
import { parseTeamRoutineKey } from "../src/components/team-view/team-routines-model.ts";
import type { Agent } from "../src/lib/types.ts";

/**
 * A routine still being built in chat is not a routine yet — it is an unclaimed
 * setup activity. The team's list has to show those as rows too, or a routine
 * started from the team surface disappears from it the moment its chat closes.
 */

const agent = (id: string, name = id): Agent =>
  ({ id, name, folderPath: `/w/${id}` }) as Agent;

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

const routine = (id: string, extra: Partial<Routine> = {}): Routine =>
  ({ id, name: id, enabled: true, schedule: "0 9 * * *", ...extra }) as Routine;

describe("aggregateTeamRoutineDrafts", () => {
  it("lists every scoped agent's unclaimed setup chats as rows", () => {
    const list = aggregateTeamRoutineDrafts([
      {
        agent: agent("a", "Ana"),
        activities: [activity("act-1")],
        routines: [],
      },
      {
        agent: agent("b", "Bo"),
        activities: [activity("act-2")],
        routines: [],
      },
    ]);
    assert.equal(list.drafts.length, 2);
    assert.deepEqual(
      list.drafts.map((d) => list.ownerOf[d.id].name),
      ["Ana", "Bo"],
    );
  });

  it("namespaces rows by owner, so two agents' activity ids cannot collide", () => {
    // Activity ids are unique per AGENT. A list keyed on the bare id would
    // light both rows at once and discard one to the same map slot.
    const list = aggregateTeamRoutineDrafts([
      {
        agent: agent("a", "Ana"),
        activities: [activity("act-1")],
        routines: [],
      },
      {
        agent: agent("b", "Bo"),
        activities: [activity("act-1")],
        routines: [],
      },
    ]);
    assert.equal(list.drafts.length, 2);
    assert.notEqual(list.drafts[0].id, list.drafts[1].id);
    for (const draft of list.drafts) {
      const parsed = parseTeamRoutineKey(draft.id);
      assert.equal(parsed?.routineId, "act-1");
      assert.equal(list.activityIdOf[draft.id], "act-1");
      assert.equal(list.ownerOf[draft.id].id, parsed?.agentId);
    }
  });

  it("drops a chat a routine already claimed, in either link direction", () => {
    const list = aggregateTeamRoutineDrafts([
      {
        agent: agent("a"),
        activities: [
          activity("forward"),
          activity("reverse", { routine_id: "r-2" }),
          activity("still-a-draft"),
        ],
        routines: [routine("r-1", { setup_activity_id: "forward" })],
      },
    ]);
    assert.deepEqual(
      list.drafts.map((d) => list.activityIdOf[d.id]),
      ["still-a-draft"],
    );
  });

  it("ignores archived chats and anything that is not a setup chat", () => {
    const list = aggregateTeamRoutineDrafts([
      {
        agent: agent("a"),
        activities: [
          activity("discarded", { status: "archived" }),
          activity("a-mission", { agent: "" }),
          activity("legacy-reaction", { agent: "houston:reaction-setup" }),
        ],
        routines: [],
      },
    ]);
    // The legacy reaction sentinel stays resumable forever; the other two are
    // not drafts at all.
    assert.deepEqual(
      list.drafts.map((d) => list.activityIdOf[d.id]),
      ["legacy-reaction"],
    );
  });

  it("holds no rows for an agent whose reads have not answered", () => {
    const list = aggregateTeamRoutineDrafts([
      { agent: agent("a"), activities: undefined, routines: undefined },
    ]);
    assert.deepEqual(list.drafts, []);
    assert.deepEqual(list.ownerOf, {});
  });

  it("keeps the team's agent order, then each agent's own chat order", () => {
    const list = aggregateTeamRoutineDrafts([
      {
        agent: agent("z", "Zoe"),
        activities: [activity("z-1"), activity("z-2")],
        routines: [],
      },
      { agent: agent("a", "Ana"), activities: [activity("a-1")], routines: [] },
    ]);
    assert.deepEqual(
      list.drafts.map((d) => list.activityIdOf[d.id]),
      ["z-1", "z-2", "a-1"],
    );
  });
});
