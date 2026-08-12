import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AgentTeam } from "@houston-ai/engine-client";
import type { PendingTeamMove } from "../src/lib/pending-team-move.ts";
import {
  completeTeamMovePostscript,
  drivePendingTeamMove,
  reconcileTeamByName,
  teamMoveAgentsSettled,
} from "../src/lib/team-move-resume.ts";

const TEAM: AgentTeam = {
  id: "new",
  name: "Design",
  isDefault: false,
  sortOrder: 1,
  agentSlugs: [],
  memberCount: 1,
  joined: true,
  owner: true,
};
const PENDING: PendingTeamMove = {
  sourceTeam: {
    id: "old",
    name: "Design",
    icon: "palette",
    color: "blue",
    context: "Brand",
    isDefault: false,
  },
  targetSlug: "abcdef0123456789",
  targetName: "Acme",
  agentIds: ["a", "b"],
  movedAgentIds: [],
  startedAt: 1,
};

describe("team move postscript", () => {
  it("settles only from durable moved-agent checkpoints", () => {
    strictEqual(teamMoveAgentsSettled(PENDING), false);
    strictEqual(
      teamMoveAgentsSettled({ ...PENDING, movedAgentIds: ["a", "b"] }),
      true,
    );
  });
  it("reconciles by normalized name", () => {
    strictEqual(reconcileTeamByName([TEAM], " design ")?.id, "new");
    strictEqual(reconcileTeamByName([TEAM], "Other"), null);
  });
  it("completes idempotently with an existing team", async () => {
    const calls: string[] = [];
    const id = await completeTeamMovePostscript(PENDING, {
      deleteSource: async () => void calls.push("delete"),
      switchTarget: async () => void calls.push("switch"),
      listTargetTeams: async () => [TEAM],
      createTargetTeam: async () => {
        throw new Error("must reconcile");
      },
      updateTargetTeam: async () => void calls.push("context"),
      placeAgent: async (agent) => void calls.push(`place:${agent}`),
    });
    strictEqual(id, "new");
    deepStrictEqual(calls, [
      "delete",
      "switch",
      "context",
      "place:a",
      "place:b",
    ]);
  });
  it("reconciles a recreated team by persisted id before its name", async () => {
    let created = 0;
    const renamed = { ...TEAM, id: "persisted", name: "Renamed" };
    const id = await completeTeamMovePostscript(
      { ...PENDING, createdTeamId: "persisted" },
      {
        deleteSource: async () => {},
        switchTarget: async () => {},
        listTargetTeams: async () => [renamed, TEAM],
        createTargetTeam: async () => {
          created += 1;
          return TEAM;
        },
        updateTargetTeam: async () => {},
        placeAgent: async () => {},
      },
    );
    strictEqual(id, "persisted");
    strictEqual(created, 0);
  });
  it("creates and drives missing per-agent tickets before postscript", async () => {
    const events: string[] = [];
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: (move) => void events.push(`record:${move.agentId}`),
      updateAgentMoveId: (_agentId, moveId) =>
        void events.push(`ticket:${moveId}`),
      clearAgentMove: (agentId) => void events.push(`clear:${agentId}`),
      markAgentMoved: (agentId) => void events.push(`moved:${agentId}`),
      resumeAgentMove: async (_pending, options) => {
        options.onMoveAccepted?.("accepted");
        return { outcome: "done" };
      },
      runPostscript: async () => void events.push("postscript"),
    });
    strictEqual(result.outcome, "done");
    deepStrictEqual(events, [
      "record:a",
      "ticket:accepted",
      "clear:a",
      "moved:a",
      "record:b",
      "ticket:accepted",
      "clear:b",
      "moved:b",
      "postscript",
    ]);
  });
  it("stops a failed record before postscript", async () => {
    const result = await drivePendingTeamMove(PENDING, {
      readAgentMove: () => undefined,
      recordAgentMove: () => {},
      updateAgentMoveId: () => {},
      clearAgentMove: () => {},
      markAgentMoved: () => {},
      resumeAgentMove: async () => ({ outcome: "timeout" }),
      runPostscript: async () => {
        throw new Error("must not run");
      },
    });
    deepStrictEqual(result, { outcome: "failed", agentId: "a" });
  });
  it("treats a missing source as deleted and creates once", async () => {
    let created = 0;
    await completeTeamMovePostscript(
      PENDING,
      {
        deleteSource: async () => {
          throw new Error("missing");
        },
        switchTarget: async () => {},
        listTargetTeams: async () => [],
        createTargetTeam: async () => {
          created += 1;
          return TEAM;
        },
        updateTargetTeam: async () => {},
        placeAgent: async () => {},
      },
      { isMissingSource: () => true },
    );
    strictEqual(created, 1);
  });
  it("default teams only switch", async () => {
    const calls: string[] = [];
    await completeTeamMovePostscript(
      { ...PENDING, sourceTeam: { ...PENDING.sourceTeam, isDefault: true } },
      {
        deleteSource: async () => void calls.push("delete"),
        switchTarget: async () => void calls.push("switch"),
        listTargetTeams: async () => [],
        createTargetTeam: async () => TEAM,
        updateTargetTeam: async () => {},
        placeAgent: async () => {},
      },
    );
    deepStrictEqual(calls, ["switch"]);
  });
});
