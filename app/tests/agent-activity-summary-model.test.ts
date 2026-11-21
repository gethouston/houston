import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildAgentActivitySummaries,
  summarizeActivities,
  teamActivityRollup,
} from "../src/components/shell/agent-activity-summary-model.ts";

const READ_ALL = () => true;

const AGENTS = [
  { id: "agent-a", folderPath: "/workspace/a" },
  { id: "agent-b", folderPath: "/workspace/b" },
  { id: "agent-c", folderPath: "/workspace/c" },
];

describe("agent activity summary model", () => {
  it("counts needs-you and running activity rows by agent", () => {
    const summaries = buildAgentActivitySummaries(
      AGENTS,
      [
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
      ],
      READ_ALL,
    );

    deepStrictEqual(summaries, {
      "agent-a": {
        needsYouCount: 2,
        runningCount: 1,
        headline: null,
        history: "some",
      },
      "agent-b": {
        needsYouCount: 0,
        runningCount: 1,
        headline: null,
        history: "some",
      },
      "agent-c": {
        needsYouCount: 0,
        runningCount: 0,
        headline: null,
        history: "none",
      },
    });
  });

  it("names each agent's most recently moved mission", () => {
    const summaries = buildAgentActivitySummaries(
      AGENTS,
      [
        {
          id: "m1",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Older",
          updated_at: "2026-09-25T10:00:00Z",
        },
        {
          id: "m2",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Newest",
          updated_at: "2026-09-26T09:00:00.500Z",
        },
        {
          id: "m3",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Middle",
          updated_at: "2026-09-26T09:00:00Z",
        },
      ],
      READ_ALL,
    );
    deepStrictEqual(summaries["agent-a"]?.headline, {
      title: "Newest",
      updatedAt: "2026-09-26T09:00:00.500Z",
      status: "idle",
    });
  });

  it("never names an archived, setup, untitled, undated or chat row", () => {
    const at = "2026-09-26T09:00:00Z";
    const summaries = buildAgentActivitySummaries(
      AGENTS,
      [
        {
          id: "a",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Gone",
          status: "archived",
          updated_at: at,
        },
        {
          id: "b",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Setup",
          agent: "houston:routine-setup",
          updated_at: at,
        },
        {
          id: "c",
          agent_path: "/workspace/a",
          type: "activity",
          title: "  ",
          updated_at: at,
        },
        {
          id: "d",
          agent_path: "/workspace/a",
          type: "activity",
          title: "Undated",
        },
        {
          id: "e",
          agent_path: "/workspace/a",
          type: "primary",
          title: "Chat",
          updated_at: at,
        },
      ],
      READ_ALL,
    );
    deepStrictEqual(summaries["agent-a"]?.headline, null);
  });

  it("summarizes one agent's own board rows with the same counting rule", () => {
    deepStrictEqual(
      summarizeActivities(
        [
          { status: "needs_you" },
          { status: "needs_you" },
          { status: "running" },
          { status: "done" },
          { status: "archived" },
        ],
        true,
      ),
      {
        needsYouCount: 2,
        runningCount: 1,
        headline: null,
        history: "some",
      },
    );
  });

  it("summarizeActivities skips routine-setup chats, like the aggregate path", () => {
    deepStrictEqual(
      summarizeActivities(
        [
          { status: "needs_you", agent: "houston:routine-setup" },
          { status: "needs_you" },
        ],
        true,
      ),
      {
        needsYouCount: 1,
        runningCount: 0,
        headline: null,
        history: "some",
      },
    );
  });

  it("summarizeActivities picks the headline with the same rule", () => {
    deepStrictEqual(
      summarizeActivities(
        [
          {
            status: "done",
            title: "Earlier",
            updated_at: "2026-09-25T10:00:00Z",
          },
          {
            status: "archived",
            title: "Archived",
            updated_at: "2026-09-27T10:00:00Z",
          },
          {
            status: "running",
            title: "Later",
            updated_at: "2026-09-26T10:00:00Z",
          },
        ],
        true,
      ).headline,
      { title: "Later", updatedAt: "2026-09-26T10:00:00Z", status: "running" },
    );
  });
});

describe("work history", () => {
  const ONE = [{ id: "a", folderPath: "/w/a" }];

  it("is none only once an empty slice was read this session", () => {
    strictEqual(
      buildAgentActivitySummaries(ONE, [], () => true).a?.history,
      "none",
    );
  });

  it("stays unknown while the slice is unread, however empty it looks", () => {
    strictEqual(
      buildAgentActivitySummaries(ONE, [], () => false).a?.history,
      "unknown",
    );
    strictEqual(summarizeActivities([], false).history, "unknown");
  });

  it("counts any task as work begun, archived and setup chats included", () => {
    for (const row of [
      { status: "archived" },
      { agent: "houston:routine-setup" },
    ]) {
      const summaries = buildAgentActivitySummaries(
        ONE,
        [{ id: "m", agent_path: "/w/a", type: "activity", ...row }],
        () => true,
      );
      strictEqual(summaries.a?.history, "some");
    }
  });

  it("never counts the agent's own chat as a task", () => {
    const summaries = buildAgentActivitySummaries(
      ONE,
      [{ id: "c", agent_path: "/w/a", type: "primary" }],
      () => true,
    );
    strictEqual(summaries.a?.history, "none");
  });
});

describe("teamActivityRollup", () => {
  const summaries = {
    "agent-a": {
      needsYouCount: 2,
      runningCount: 1,
      headline: null,
      history: "some" as const,
    },
    "agent-b": {
      needsYouCount: 3,
      runningCount: 0,
      headline: null,
      history: "some" as const,
    },
    "agent-c": {
      needsYouCount: 0,
      runningCount: 0,
      headline: null,
      history: "none" as const,
    },
  };

  it("sums its members' needs-you and running counts", () => {
    deepStrictEqual(teamActivityRollup(["agent-a", "agent-b"], summaries), {
      needsYouCount: 5,
      runningCount: 1,
    });
  });

  it("counts only the agents it was given", () => {
    deepStrictEqual(teamActivityRollup(["agent-c"], summaries), {
      needsYouCount: 0,
      runningCount: 0,
    });
  });

  it("says nothing for an empty team", () => {
    deepStrictEqual(teamActivityRollup([], summaries), {
      needsYouCount: 0,
      runningCount: 0,
    });
  });

  it("contributes nothing for an agent with no summary yet", () => {
    deepStrictEqual(teamActivityRollup(["agent-a", "ghost"], summaries), {
      needsYouCount: 2,
      runningCount: 1,
    });
  });
});

describe("the summaries hook", () => {
  it("confirms an empty history only from an authoritative aggregate", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL(
        "../src/components/shell/use-agent-activity-summaries.ts",
        import.meta.url,
      ),
      "utf8",
    );
    strictEqual(
      src.includes(
        "aggregateIsAuthoritative ? sliceCoverage.wasRead : () => false",
      ),
      true,
    );
    strictEqual(src.includes("summarizeActivities(activities, false)"), true);
    strictEqual(src.includes("sliceCoverage.wasRead(agent.folderPath)"), false);
  });
});
