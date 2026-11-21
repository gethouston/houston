import { deepStrictEqual, strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { readPendingMoves } from "../src/lib/pending-move.ts";
import {
  moveTeamAgent,
  teamAgentMoveError,
} from "../src/lib/team-agent-move.ts";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

const AGENT = { id: "7af3d710003ad396", name: "Nova" };
const TEAM = { slug: "abcdef0123456789", name: "Acme" };

describe("moveTeamAgent on a name the team already holds", () => {
  beforeEach(() => store.clear());

  it("voids the pending move it recorded before the POST", async () => {
    const posts: string[] = [];
    const result = await moveTeamAgent(AGENT, TEAM, {
      moveAgent: async (_id, to) => {
        posts.push(to);
        throw { status: 409, body: { error: "taken", code: "name_taken" } };
      },
      moveStatus: async () => {
        throw new Error("a refused move has no ticket to poll");
      },
    });
    deepStrictEqual(result, { outcome: "refused", code: "name_taken" });
    deepStrictEqual(posts, [TEAM.slug]);
    deepStrictEqual(readPendingMoves(), []);
    strictEqual(teamAgentMoveError(result), "name_taken");
  });

  it("keeps the record when the gateway may still hold the move", async () => {
    const result = await moveTeamAgent(AGENT, TEAM, {
      moveAgent: async () => {
        throw { status: 403, body: { error: "forbidden", code: "not_member" } };
      },
      moveStatus: async () => ({ status: "done" }),
    });
    deepStrictEqual(result, { outcome: "rejected", code: "not_member" });
    strictEqual(readPendingMoves().length, 1);
    strictEqual(teamAgentMoveError(result), "unknown");
  });
});

describe("moveTeamAgent for an agent the team already holds", () => {
  beforeEach(() => store.clear());

  it("clears the pending move: the move is done (agent_moved)", async () => {
    const result = await moveTeamAgent(AGENT, TEAM, {
      moveAgent: async () => {
        throw { status: 409, body: { error: "moved", code: "agent_moved" } };
      },
      moveStatus: async () => {
        throw new Error("a finished move has no ticket to poll");
      },
    });
    deepStrictEqual(result, { outcome: "done" });
    deepStrictEqual(readPendingMoves(), []);
  });

  it("clears the pending move when the agent is in neither space", async () => {
    const result = await moveTeamAgent(AGENT, TEAM, {
      moveAgent: async () => {
        throw { status: 404, body: { error: "gone", code: "agent_not_found" } };
      },
      moveStatus: async () => {
        throw new Error("a missing agent has no ticket to poll");
      },
    });
    deepStrictEqual(result, { outcome: "gone" });
    deepStrictEqual(readPendingMoves(), []);
  });
});
