import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type AgentHomeConversation,
  agentHomeFilterTeam,
  agentHomeHasTeamFilter,
  agentHomeRows,
  agentRowsForTeam,
} from "../src/components/agents-home/agents-home-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

// The mobile Agents home's pure rules: the attention sort, what a row says
// about its agent (preview, count, time) and the team filter. Counts come
// from the shared summaries (never recomputed).

const agent = (id: string, name = id) => ({
  id,
  name,
  folderPath: `/ws/${id}`,
});

const mission = (
  over: Partial<AgentHomeConversation> & { id: string; agent_path: string },
): AgentHomeConversation => ({
  title: `Mission ${over.id}`,
  type: "activity",
  status: "running",
  updated_at: "2026-08-28T10:00:00Z",
  ...over,
});

const summary = (needsYouCount: number, runningCount: number) => ({
  needsYouCount,
  runningCount,
});

const team = (id: string, agentIds: string[]): TeamView => ({
  id,
  name: id,
  agents: agentIds.map((agentId) => ({ id: agentId, name: agentId }) as Agent),
  isDefault: id === "team:default",
});

describe("agentHomeRows", () => {
  it("attention-sorts: needs-you, then running, then recency", () => {
    const agents = [agent("idle"), agent("busy"), agent("waiting")];
    const rows = agentHomeRows(agents, [], {
      idle: summary(0, 0),
      busy: summary(0, 2),
      waiting: summary(1, 0),
    });
    assert.deepEqual(
      rows.map((r) => r.agent.id),
      ["waiting", "busy", "idle"],
    );
  });

  it("orders inside a band by the latest movement, newest first", () => {
    const agents = [agent("a"), agent("b")];
    const conversations = [
      mission({
        id: "m1",
        agent_path: "/ws/a",
        updated_at: "2026-08-27T09:00:00Z",
      }),
      mission({
        id: "m2",
        agent_path: "/ws/b",
        updated_at: "2026-08-28T09:00:00Z",
      }),
    ];
    const rows = agentHomeRows(agents, conversations, {
      a: summary(1, 0),
      b: summary(1, 0),
    });
    assert.deepEqual(
      rows.map((r) => r.agent.id),
      ["b", "a"],
    );
  });

  it("previews the latest task's title and counts the visible ones", () => {
    const rows = agentHomeRows(
      [agent("a")],
      [
        mission({
          id: "old",
          agent_path: "/ws/a",
          title: "Older task",
          updated_at: "2026-08-27T09:00:00Z",
        }),
        mission({
          id: "new",
          agent_path: "/ws/a",
          title: "Newest task",
          updated_at: "2026-08-28T09:00:00Z",
        }),
      ],
      { a: summary(0, 1) },
    );
    assert.equal(rows[0].latestTitle, "Newest task");
    assert.equal(rows[0].taskCount, 2);
    assert.equal(rows[0].lastAt, Date.parse("2026-08-28T09:00:00Z"));
  });

  it("keeps the first swept row as the preview on an exact time tie", () => {
    const rows = agentHomeRows(
      [agent("a")],
      [
        mission({ id: "first", agent_path: "/ws/a", title: "First" }),
        mission({ id: "second", agent_path: "/ws/a", title: "Second" }),
      ],
      { a: summary(0, 0) },
    );
    assert.equal(rows[0].latestTitle, "First");
  });

  it("dates and previews by real work, never a setup chat or the archive", () => {
    const rows = agentHomeRows(
      [agent("a")],
      [
        mission({
          id: "new",
          agent_path: "/ws/a",
          title: "Real work",
          updated_at: "2026-08-27T09:00:00Z",
        }),
        mission({
          id: "arch",
          agent_path: "/ws/a",
          title: "Archived",
          status: "archived",
          updated_at: "2026-08-28T09:00:00Z",
        }),
        mission({
          id: "setup",
          agent_path: "/ws/a",
          title: "Setup",
          agent: "houston:routine-setup",
          updated_at: "2026-08-28T10:00:00Z",
        }),
      ],
      { a: summary(0, 1) },
    );
    assert.equal(rows[0].lastAt, Date.parse("2026-08-27T09:00:00Z"));
    assert.equal(rows[0].latestTitle, "Real work");
    assert.equal(rows[0].taskCount, 1);
  });

  it("an agent with no summary and no rows contributes zeros, not a crash", () => {
    const rows = agentHomeRows([agent("a")], undefined, {});
    assert.equal(rows[0].needsYouCount, 0);
    assert.equal(rows[0].runningCount, 0);
    assert.equal(rows[0].taskCount, 0);
    assert.equal(rows[0].latestTitle, null);
    assert.equal(rows[0].lastAt, null);
  });
});

describe("the team filter", () => {
  const rows = agentHomeRows([agent("a"), agent("b"), agent("c")], [], {
    a: summary(1, 0),
    b: summary(0, 0),
    c: summary(0, 0),
  });
  const teams = [team("t1", ["b", "c"]), team("team:default", ["a"])];

  it("is offered only when there is more than one team to choose", () => {
    assert.equal(agentHomeHasTeamFilter([team("team:default", ["a"])]), false);
    assert.equal(agentHomeHasTeamFilter(teams), true);
  });

  it("resolves the chosen team, and a missing one to every team", () => {
    assert.equal(agentHomeFilterTeam(teams, null), null);
    assert.equal(agentHomeFilterTeam(teams, "t1")?.id, "t1");
    assert.equal(agentHomeFilterTeam(teams, "gone"), null);
  });

  it("shows every agent under no team, in the attention order", () => {
    assert.deepEqual(
      agentRowsForTeam(rows, null).map((r) => r.agent.id),
      ["a", "b", "c"],
    );
  });

  it("narrows to the team's members, keeping the attention order", () => {
    assert.deepEqual(
      agentRowsForTeam(rows, teams[0]).map((r) => r.agent.id),
      ["b", "c"],
    );
    assert.deepEqual(
      agentRowsForTeam(rows, teams[1]).map((r) => r.agent.id),
      ["a"],
    );
  });
});
