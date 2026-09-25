import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentMissionCount,
  agentMissionSections,
  isCreatedMissionOf,
  liveMissionCount,
  missionListSections,
  searchMissions,
} from "../src/components/agents-home/agent-missions-model.ts";
import type { AgentHomeConversation } from "../src/components/agents-home/agents-home-model.ts";

// One agent's task list: the board's own status split, plus what the segmented
// control and the search narrow it to. The promise: a task sits in the same
// band here as the column it occupies on the board this screen pushes into.

const mission = (
  over: Partial<AgentHomeConversation> & { id: string; agent_path: string },
): AgentHomeConversation => ({
  title: `Mission ${over.id}`,
  type: "activity",
  status: "running",
  updated_at: "2026-08-28T10:00:00Z",
  ...over,
});

describe("agentMissionSections", () => {
  it("splits one agent's rows by the board's own status mapping", () => {
    const sections = agentMissionSections(
      [
        mission({ id: "r", agent_path: "/ws/a", status: "running" }),
        mission({ id: "n", agent_path: "/ws/a", status: "needs_you" }),
        // An errored mission sits in Needs you, exactly as on the board.
        mission({ id: "e", agent_path: "/ws/a", status: "error" }),
        mission({ id: "d", agent_path: "/ws/a", status: "done" }),
        mission({ id: "arch", agent_path: "/ws/a", status: "archived" }),
        // Another agent's row never leaks in.
        mission({ id: "other", agent_path: "/ws/b", status: "running" }),
        // Setup chats are not missions.
        mission({
          id: "setup",
          agent_path: "/ws/a",
          agent: "houston:routine-setup",
        }),
      ],
      "/ws/a",
    );
    assert.deepEqual(
      sections.running.map((m) => m.id),
      ["r"],
    );
    assert.deepEqual(sections.needsYou.map((m) => m.id).sort(), ["e", "n"]);
    assert.deepEqual(
      sections.done.map((m) => m.id),
      ["d"],
    );
    assert.deepEqual(
      sections.archived.map((m) => m.id),
      ["arch"],
    );
  });

  it("orders every section newest movement first", () => {
    const sections = agentMissionSections(
      [
        mission({
          id: "older",
          agent_path: "/ws/a",
          updated_at: "2026-08-26T09:00:00Z",
        }),
        mission({
          id: "newer",
          agent_path: "/ws/a",
          updated_at: "2026-08-27T09:00:00Z",
        }),
      ],
      "/ws/a",
    );
    assert.deepEqual(
      sections.running.map((m) => m.id),
      ["newer", "older"],
    );
  });
});

const sections = agentMissionSections(
  [
    mission({ id: "n", agent_path: "/ws/a", status: "needs_you" }),
    mission({
      id: "r",
      agent_path: "/ws/a",
      status: "running",
      title: "Renew the domain",
    }),
    mission({ id: "d", agent_path: "/ws/a", status: "done" }),
    mission({ id: "arch", agent_path: "/ws/a", status: "archived" }),
  ],
  "/ws/a",
);

describe("searchMissions", () => {
  it("matches titles case-insensitively; a blank query keeps everyone", () => {
    assert.deepEqual(
      searchMissions(sections.running, "RENEW").map((m) => m.id),
      ["r"],
    );
    assert.equal(searchMissions(sections.running, "  ").length, 1);
    assert.equal(searchMissions(sections.running, "zzz").length, 0);
  });
});

describe("missionListSections", () => {
  it("draws the three bands in order under All", () => {
    assert.deepEqual(
      missionListSections(sections, "all", "").map((s) => s.id),
      ["needsYou", "running", "done"],
    );
  });

  it("leaves only the picked segment's band standing", () => {
    assert.deepEqual(
      missionListSections(sections, "running", "").map((s) => s.id),
      ["running"],
    );
  });

  it("drops a band the search emptied rather than heading nothing", () => {
    assert.deepEqual(
      missionListSections(sections, "all", "renew").map((s) => s.id),
      ["running"],
    );
    assert.deepEqual(missionListSections(sections, "all", "zzz"), []);
  });

  it("never lists the archive: it is the list's own basement", () => {
    const ids = missionListSections(sections, "all", "").flatMap((s) =>
      s.missions.map((m) => m.id),
    );
    assert.ok(!ids.includes("arch"));
  });
});

describe("mission counts", () => {
  const sections = agentMissionSections(
    [
      mission({ id: "r", agent_path: "/ws/a", status: "running" }),
      mission({ id: "d", agent_path: "/ws/a", status: "done" }),
      mission({ id: "arch", agent_path: "/ws/a", status: "archived" }),
    ],
    "/ws/a",
  );

  it("counts the archive among everything the agent holds", () => {
    assert.equal(agentMissionCount(sections), 3);
  });

  it("leaves the archive out of the live count", () => {
    assert.equal(liveMissionCount(sections), 2);
  });

  it("counts nothing for an agent with no missions", () => {
    const empty = agentMissionSections([], "/ws/a");
    assert.equal(agentMissionCount(empty), 0);
    assert.equal(liveMissionCount(empty), 0);
  });
});

describe("isCreatedMissionOf", () => {
  const created = { activityId: "m1", agentPath: "/ws/a" };

  it("claims the mission just created for this agent", () => {
    assert.equal(isCreatedMissionOf(created, "m1", "/ws/a"), true);
  });

  it("leaves another agent's creation to its own screen", () => {
    assert.equal(isCreatedMissionOf(created, "m1", "/ws/b"), false);
  });

  it("leaves a published target that is not the creation to a board", () => {
    assert.equal(isCreatedMissionOf(created, "m2", "/ws/a"), false);
  });

  it("claims nothing when nothing is published or created", () => {
    assert.equal(isCreatedMissionOf(created, null, "/ws/a"), false);
    assert.equal(isCreatedMissionOf(null, "m1", "/ws/a"), false);
  });
});
