import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type AgentHomeConversation,
  agentHomeRows,
  agentTreeSections,
} from "../src/components/agents-home/agents-home-model.ts";
import type { TeamView } from "../src/lib/teams-model.ts";
import type { Agent } from "../src/lib/types.ts";

// The mobile Agents home's pure rules: the attention sort and the team tree.
// Counts come from the shared summaries (never recomputed); the tree is what
// the phone screen draws, so grouping and order are the whole contract.

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

  it("dates the band by real work, never a setup chat or the archive", () => {
    const rows = agentHomeRows(
      [agent("a")],
      [
        mission({
          id: "new",
          agent_path: "/ws/a",
          updated_at: "2026-08-27T09:00:00Z",
        }),
        mission({
          id: "arch",
          agent_path: "/ws/a",
          status: "archived",
          updated_at: "2026-08-28T09:00:00Z",
        }),
        mission({
          id: "setup",
          agent_path: "/ws/a",
          agent: "houston:routine-setup",
          updated_at: "2026-08-28T10:00:00Z",
        }),
      ],
      { a: summary(0, 1) },
    );
    assert.equal(rows[0].lastAt, Date.parse("2026-08-27T09:00:00Z"));
  });

  it("an agent with no summary and no rows contributes zeros, not a crash", () => {
    const rows = agentHomeRows([agent("a")], undefined, {});
    assert.equal(rows[0].needsYouCount, 0);
    assert.equal(rows[0].runningCount, 0);
    assert.equal(rows[0].lastAt, null);
  });
});

describe("agentTreeSections", () => {
  const rows = agentHomeRows([agent("a"), agent("b"), agent("c")], [], {
    a: summary(1, 0),
    b: summary(0, 0),
    c: summary(0, 0),
  });

  it("stays FLAT when the workspace has only its default team", () => {
    const sections = agentTreeSections([team("team:default", ["a"])], rows);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].team, null);
    assert.deepEqual(
      sections[0].rows.map((r) => r.agent.id),
      ["a", "b", "c"],
    );
  });

  it("groups by team in rail order, keeping the attention order inside", () => {
    const sections = agentTreeSections(
      [team("t1", ["b", "c"]), team("team:default", ["a"])],
      rows,
    );
    assert.deepEqual(
      sections.map((s) => s.team?.id),
      ["t1", "team:default"],
    );
    assert.deepEqual(
      sections[0].rows.map((r) => r.agent.id),
      ["b", "c"],
    );
    assert.deepEqual(
      sections[1].rows.map((r) => r.agent.id),
      ["a"],
    );
  });

  it("skips a team with no agents rather than drawing an empty header", () => {
    const sections = agentTreeSections(
      [team("t1", ["a"]), team("empty", []), team("team:default", ["b", "c"])],
      rows,
    );
    assert.deepEqual(
      sections.map((s) => s.team?.id),
      ["t1", "team:default"],
    );
  });

  it("answers nothing at all with nothing (the empty state's job)", () => {
    assert.deepEqual(agentTreeSections([team("t1", ["a"])], []), []);
  });
});
