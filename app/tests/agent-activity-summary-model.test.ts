import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildAgentActivitySummaries } from "../src/components/shell/agent-activity-summary-model.ts";

describe("agent activity summary model", () => {
  it("counts needs-you and running activity rows by agent", () => {
    const summaries = buildAgentActivitySummaries(
      [
        { id: "agent-a", folderPath: "/workspace/a" },
        { id: "agent-b", folderPath: "/workspace/b" },
        { id: "agent-c", folderPath: "/workspace/c" },
      ],
      [
        { agent_path: "/workspace/a", type: "activity", status: "needs_you" },
        { agent_path: "/workspace/a", type: "activity", status: "needs_you" },
        { agent_path: "/workspace/a", type: "activity", status: "running" },
        { agent_path: "/workspace/b", type: "activity", status: "running" },
        { agent_path: "/workspace/b", type: "activity", status: "done" },
        { agent_path: "/workspace/b", type: "primary", status: "needs_you" },
        {
          agent_path: "/workspace/missing",
          type: "activity",
          status: "needs_you",
        },
      ],
    );

    deepStrictEqual(summaries, {
      "agent-a": { needsYouCount: 2, runningCount: 1 },
      "agent-b": { needsYouCount: 0, runningCount: 1 },
      "agent-c": { needsYouCount: 0, runningCount: 0 },
    });
  });
});
