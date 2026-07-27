import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildAgentActivitySummaries,
  summarizeActivities,
} from "../src/components/shell/agent-activity-summary-model.ts";
import type { ReadCursorStore } from "../src/lib/read-cursors.ts";

const AGENTS = [
  { id: "agent-a", folderPath: "/workspace/a" },
  { id: "agent-b", folderPath: "/workspace/b" },
  { id: "agent-c", folderPath: "/workspace/c" },
];

const ME = "user-me";
const MATE = "user-mate";

/** Everything happened after this floor, so unread is decided by relevance. */
const STORE: ReadCursorStore = { since: 0, cursors: {} };
const MOVED = "2026-07-01T10:00:00.000Z";

describe("agent activity summary model", () => {
  it("counts needs-you and running activity rows by agent", () => {
    const summaries = buildAgentActivitySummaries(AGENTS, [
      {
        id: "m1",
        agent_path: "/workspace/a",
        type: "activity",
        status: "needs_you",
      },
      {
        id: "m2",
        agent_path: "/workspace/a",
        type: "activity",
        status: "needs_you",
      },
      {
        id: "m3",
        agent_path: "/workspace/a",
        type: "activity",
        status: "running",
      },
      {
        id: "m4",
        agent_path: "/workspace/b",
        type: "activity",
        status: "running",
      },
      {
        id: "m5",
        agent_path: "/workspace/b",
        type: "activity",
        status: "done",
      },
      {
        id: "m6",
        agent_path: "/workspace/b",
        type: "primary",
        status: "needs_you",
      },
      {
        id: "m7",
        agent_path: "/workspace/missing",
        type: "activity",
        status: "needs_you",
      },
    ]);

    deepStrictEqual(summaries, {
      "agent-a": { needsYouCount: 2, runningCount: 1, unreadCount: 0 },
      "agent-b": { needsYouCount: 0, runningCount: 1, unreadCount: 0 },
      "agent-c": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
    });
  });

  it("summarizes one agent's own board rows with the same counting rule", () => {
    deepStrictEqual(
      summarizeActivities([
        { status: "needs_you" },
        { status: "needs_you" },
        { status: "running" },
        { status: "done" },
        { status: "archived" },
      ]),
      { needsYouCount: 2, runningCount: 1, unreadCount: 0 },
    );
  });

  it("summarizeActivities skips routine-setup chats, like the aggregate path", () => {
    deepStrictEqual(
      summarizeActivities([
        { status: "needs_you", agent: "houston:routine-setup" },
        { status: "needs_you" },
      ]),
      { needsYouCount: 1, runningCount: 0, unreadCount: 0 },
    );
  });
});

describe("agent activity summary model — unread badge", () => {
  const CONVERSATIONS = [
    // Mine: created by me.
    {
      id: "mine",
      agent_path: "/workspace/a",
      type: "activity" as const,
      status: "done",
      updated_at: MOVED,
      created_by: ME,
    },
    // Not mine and no mention of me: a teammate's mission is not my news.
    {
      id: "theirs",
      agent_path: "/workspace/a",
      type: "activity" as const,
      status: "done",
      updated_at: MOVED,
      created_by: MATE,
    },
    // Not mine, but it @mentions me: the mention IS the claim on my attention.
    {
      id: "mentions-me",
      agent_path: "/workspace/b",
      type: "activity" as const,
      status: "done",
      updated_at: MOVED,
      created_by: MATE,
      mentioned: [{ user_id: ME, at: MOVED, by: MATE }],
    },
    // A guided setup chat never counts, even when it is mine.
    {
      id: "setup",
      agent_path: "/workspace/b",
      type: "activity" as const,
      status: "done",
      updated_at: MOVED,
      created_by: ME,
      agent: "houston:routine-setup",
    },
  ];

  it("counts only my missions and missions that mention me", () => {
    const summaries = buildAgentActivitySummaries(AGENTS, CONVERSATIONS, {
      store: STORE,
      selfId: ME,
    });

    deepStrictEqual(summaries, {
      "agent-a": { needsYouCount: 0, runningCount: 0, unreadCount: 1 },
      "agent-b": { needsYouCount: 0, runningCount: 0, unreadCount: 1 },
      "agent-c": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
    });
  });

  it("counts nothing when nobody is signed in", () => {
    const summaries = buildAgentActivitySummaries(AGENTS, CONVERSATIONS, {
      store: STORE,
      selfId: null,
    });

    deepStrictEqual(summaries, {
      "agent-a": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
      "agent-b": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
      "agent-c": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
    });
  });

  it("stays silent on single-player / desktop, where the hook omits `unread`", () => {
    // Same rows that DO count for this signed-in reader (see the first case),
    // so the zeros below can only come from the omitted option — the exact
    // contract the sidebar's `capabilities.multiplayer` gate relies on.
    const signedIn = buildAgentActivitySummaries(AGENTS, CONVERSATIONS, {
      store: STORE,
      selfId: ME,
    });
    deepStrictEqual(
      [signedIn["agent-a"]?.unreadCount, signedIn["agent-b"]?.unreadCount],
      [1, 1],
    );

    const summaries = buildAgentActivitySummaries(AGENTS, CONVERSATIONS);

    deepStrictEqual(summaries, {
      "agent-a": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
      "agent-b": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
      "agent-c": { needsYouCount: 0, runningCount: 0, unreadCount: 0 },
    });
  });

  it("a mission read after it moved is no longer unread", () => {
    const store: ReadCursorStore = {
      since: 0,
      cursors: {
        "/workspace/a::mine": { readAt: Date.parse(MOVED) + 1 },
      },
    };
    const summaries = buildAgentActivitySummaries(AGENTS, CONVERSATIONS, {
      store,
      selfId: ME,
    });

    deepStrictEqual(summaries["agent-a"], {
      needsYouCount: 0,
      runningCount: 0,
      unreadCount: 0,
    });
  });

  it("counts unread alongside needs-you without disturbing it", () => {
    const summaries = buildAgentActivitySummaries(
      AGENTS,
      [
        {
          id: "urgent",
          agent_path: "/workspace/a",
          type: "activity",
          status: "needs_you",
          updated_at: MOVED,
          created_by: ME,
        },
        {
          id: "busy",
          agent_path: "/workspace/a",
          type: "activity",
          status: "running",
          updated_at: MOVED,
          created_by: ME,
        },
      ],
      { store: STORE, selfId: ME },
    );

    deepStrictEqual(summaries["agent-a"], {
      needsYouCount: 1,
      runningCount: 1,
      unreadCount: 2,
    });
  });
});
