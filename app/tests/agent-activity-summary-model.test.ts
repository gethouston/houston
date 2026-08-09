import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildAgentActivitySummaries,
  summarizeActivities,
  teamActivityRollup,
} from "../src/components/shell/agent-activity-summary-model.ts";

const AGENTS = [
  { id: "agent-a", folderPath: "/workspace/a" },
  { id: "agent-b", folderPath: "/workspace/b" },
  { id: "agent-c", folderPath: "/workspace/c" },
];

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
      "agent-a": { needsYouCount: 2, runningCount: 1 },
      "agent-b": { needsYouCount: 0, runningCount: 1 },
      "agent-c": { needsYouCount: 0, runningCount: 0 },
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
      { needsYouCount: 2, runningCount: 1 },
    );
  });

  it("summarizeActivities skips routine-setup chats, like the aggregate path", () => {
    deepStrictEqual(
      summarizeActivities([
        { status: "needs_you", agent: "houston:routine-setup" },
        { status: "needs_you" },
      ]),
      { needsYouCount: 1, runningCount: 0 },
    );
  });
});

describe("teamActivityRollup", () => {
  // What a FOLDED team's header says on behalf of the agent rows it is hiding.
  // It reads the SAME per-agent summaries the rows do, so a header can never
  // disagree with the rows behind it.
  const summaries = {
    "agent-a": { needsYouCount: 2, runningCount: 1 },
    "agent-b": { needsYouCount: 3, runningCount: 0 },
    "agent-c": { needsYouCount: 0, runningCount: 0 },
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
    // Cold boot, pods still waking: a zero-shaped guess would put a badge on a
    // header the rows behind it are not showing.
    deepStrictEqual(teamActivityRollup(["agent-a", "ghost"], summaries), {
      needsYouCount: 2,
      runningCount: 1,
    });
  });
});
