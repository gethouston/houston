import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type AgentHomeConversation,
  agentHomeRows,
  agentMissionSections,
  filterAgentRows,
} from "../src/components/agents-home/agents-home-model.ts";

// PRODUCT-1559: the mobile Agents home's pure rules — the attention sort, the
// name filter, and the per-agent section split. Counts come from the shared
// summaries (never recomputed), previews from the swept rows.

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

  it("previews the most recently moved mission, never a setup chat or the archive", () => {
    const rows = agentHomeRows(
      [agent("a")],
      [
        mission({
          id: "old",
          agent_path: "/ws/a",
          title: "Old",
          updated_at: "2026-08-26T09:00:00Z",
        }),
        mission({
          id: "new",
          agent_path: "/ws/a",
          title: "New",
          updated_at: "2026-08-27T09:00:00Z",
        }),
        mission({
          id: "arch",
          agent_path: "/ws/a",
          title: "Filed",
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
    assert.equal(rows[0].lastTitle, "New");
  });

  it("an agent with no summary and no rows contributes zeros, not a crash", () => {
    const rows = agentHomeRows([agent("a")], undefined, {});
    assert.equal(rows[0].needsYouCount, 0);
    assert.equal(rows[0].lastTitle, null);
    assert.equal(rows[0].lastAt, null);
  });
});

describe("filterAgentRows", () => {
  it("filters by name, case-insensitively; blank keeps everyone", () => {
    const rows = agentHomeRows(
      [agent("a", "Finance"), agent("b", "Recruiting")],
      [],
      {},
    );
    assert.equal(filterAgentRows(rows, "fin").length, 1);
    assert.equal(filterAgentRows(rows, "FIN")[0].agent.name, "Finance");
    assert.equal(filterAgentRows(rows, "  ").length, 2);
    assert.equal(filterAgentRows(rows, "zzz").length, 0);
  });
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
