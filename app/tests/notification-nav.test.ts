import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveNotificationTarget,
  resolvePendingActivitySelection,
  type NavAgent,
} from "../src/lib/notification-nav.ts";

const agents: NavAgent[] = [
  { id: "a1", name: "Researcher", folderPath: "/ws/Researcher" },
  { id: "a2", name: "Writer", folderPath: "/ws/Writer" },
];

describe("resolveNotificationTarget", () => {
  it("targets the agent that finished, matched by folder path", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Writer", "activity-act99", "Writer"),
      { agentName: "Writer", nav: { agentId: "a2", activityId: "act99" } },
    );
  });

  // Regression for the cross-agent bug: user is on "Researcher" (the fallback)
  // when "Writer" finishes in the background. The click target must still point
  // at Writer + its activity, not stay on the open agent / go nowhere.
  it("targets the finished agent even when a different agent is open", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Writer", "activity-act99", "Researcher"),
      { agentName: "Writer", nav: { agentId: "a2", activityId: "act99" } },
    );
  });

  it("falls back to the open agent name and sets no nav when the finished agent isn't loaded", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Archived", "activity-act1", "Researcher"),
      { agentName: "Researcher" },
    );
  });

  it("sets no nav for routine sessions (no mission chat to open)", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Writer", "routine-r1", "Researcher"),
      { agentName: "Writer" },
    );
  });

  it("sets no nav for non-activity session keys", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Writer", "main", "Researcher"),
      { agentName: "Writer" },
    );
  });
});

describe("resolvePendingActivitySelection", () => {
  // The reported bug: send on agent A, close its chat, switch to agent B,
  // OPEN a chat on B (missionPanelOpen=true), then click A's notification.
  // The switch to A must open A's activity even though B's panel state is
  // still hanging around in the global store. Before the fix this returned
  // null and the click landed on the agent with no chat open.
  it("opens the pending target on an agent switch, ignoring the previous agent's open panel", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        agentSwitched: true,
        selectedId: "act-B", // belongs to the agent we left
        missionPanelOpen: true, // stale: that agent's chat was open
      }),
      "act-A",
    );
  });

  it("clears selection on a plain sidebar switch with no pending target", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: null,
        agentSwitched: true,
        selectedId: "act-B",
        missionPanelOpen: true,
      }),
      null,
    );
  });

  it("opens the pending target on the same agent when nothing is open", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        agentSwitched: false,
        selectedId: null,
        missionPanelOpen: false,
      }),
      "act-A",
    );
  });

  it("does not interrupt an open conversation on the same agent", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        agentSwitched: false,
        selectedId: "act-Z",
        missionPanelOpen: true,
      }),
      null,
    );
  });

  it("does not interrupt a New Mission composer on the same agent", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        agentSwitched: false,
        selectedId: null, // composer open: no card selected
        missionPanelOpen: true,
      }),
      null,
    );
  });

  it("returns null when nothing is pending", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: null,
        agentSwitched: false,
        selectedId: null,
        missionPanelOpen: false,
      }),
      null,
    );
  });
});
