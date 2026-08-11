import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AgentTeam } from "@houston-ai/engine-client";
import type { PendingTeamMove } from "../src/lib/pending-team-move.ts";
import {
  completeTeamMovePostscript,
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
  startedAt: 1,
};

describe("team move postscript", () => {
  it("waits until every per-agent ticket is gone", () => {
    strictEqual(teamMoveAgentsSettled(PENDING, ["b"]), false);
    strictEqual(teamMoveAgentsSettled(PENDING, ["elsewhere"]), true);
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
