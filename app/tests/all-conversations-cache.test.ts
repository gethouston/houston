import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  latestCachedAgentActivities,
  latestCachedAllConversations,
} from "../src/lib/all-conversations-cache.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

describe("latestCachedAllConversations", () => {
  it("returns undefined with no cached aggregate", () => {
    const qc = new QueryClient();
    strictEqual(latestCachedAllConversations(qc), undefined);
  });

  it("serves the newest successful roster variant", () => {
    const qc = new QueryClient();
    const older = [{ id: "old" }];
    const newer = [{ id: "new" }];
    qc.setQueryData(queryKeys.allConversations(["/w/a", "/w/b"]), older, {
      updatedAt: 1_000,
    });
    qc.setQueryData(
      queryKeys.allConversations(["/w/a", "/w/b", "/w/c"]),
      newer,
      {
        updatedAt: 2_000,
      },
    );
    deepStrictEqual(latestCachedAllConversations(qc), newer);
  });

  it("ignores unrelated query keys", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.activity("/w/a"), [{ id: "board-row" }], {
      updatedAt: 5_000,
    });
    strictEqual(latestCachedAllConversations(qc), undefined);
  });
});

describe("latestCachedAgentActivities", () => {
  const row = (id: string, agentPath: string, extra?: object) => ({
    id,
    title: `Mission ${id}`,
    description: `About ${id}`,
    status: "needs_you",
    type: "activity",
    session_key: `activity-${id}`,
    updated_at: "2026-01-01T00:00:00.000Z",
    agent_path: agentPath,
    agent_name: "Agent",
    ...extra,
  });

  it("returns undefined with nothing cached", () => {
    const qc = new QueryClient();
    strictEqual(latestCachedAgentActivities(qc, "agent-a"), undefined);
  });

  it("recovers this agent's board rows from the cached aggregate", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(["agent-a", "agent-b"]),
      [
        row("m1", "agent-a", { routine_id: "r1", agent: "researcher" }),
        row("m2", "agent-b"),
      ],
      { updatedAt: 1_000 },
    );
    deepStrictEqual(latestCachedAgentActivities(qc, "agent-a"), [
      {
        id: "m1",
        title: "Mission m1",
        description: "About m1",
        status: "needs_you",
        session_key: "activity-m1",
        updated_at: "2026-01-01T00:00:00.000Z",
        agent: "researcher",
        routine_id: "r1",
      },
    ]);
  });

  it("prefers the newest source that actually has rows", () => {
    const qc = new QueryClient();
    // Older per-agent list with a row the newer aggregate is missing: the
    // aggregate has NO rows for this agent, so it is not evidence of empty.
    qc.setQueryData(
      queryKeys.conversations("agent-a"),
      [row("m1", "agent-a")],
      {
        updatedAt: 1_000,
      },
    );
    qc.setQueryData(
      queryKeys.allConversations(["agent-a", "agent-b"]),
      [row("m2", "agent-b")],
      { updatedAt: 2_000 },
    );
    const rows = latestCachedAgentActivities(qc, "agent-a");
    deepStrictEqual(
      rows?.map((r) => r.id),
      ["m1"],
    );
  });

  it("serves the newest rows when both sources have some", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.conversations("agent-a"),
      [row("stale", "agent-a")],
      { updatedAt: 1_000 },
    );
    qc.setQueryData(
      queryKeys.allConversations(["agent-a"]),
      [row("fresh", "agent-a")],
      { updatedAt: 2_000 },
    );
    const rows = latestCachedAgentActivities(qc, "agent-a");
    deepStrictEqual(
      rows?.map((r) => r.id),
      ["fresh"],
    );
  });

  it("returns undefined, never [], when no source has rows for the agent", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      queryKeys.allConversations(["agent-a", "agent-b"]),
      [row("m2", "agent-b")],
      { updatedAt: 2_000 },
    );
    strictEqual(latestCachedAgentActivities(qc, "agent-a"), undefined);
  });
});
