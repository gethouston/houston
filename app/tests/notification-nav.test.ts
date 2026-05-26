import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveNotificationTarget,
  resolvePendingActivitySelection,
  shouldArmNotificationNav,
  shouldNavigateOnAppActivation,
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

  it("force-opens the pending target over an open same-agent conversation", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        forceOpen: true,
        agentSwitched: false,
        selectedId: "act-Z",
        missionPanelOpen: true,
      }),
      "act-A",
    );
  });

  it("force-opens the pending target over a same-agent composer", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: "act-A",
        forceOpen: true,
        agentSwitched: false,
        selectedId: null,
        missionPanelOpen: true,
      }),
      "act-A",
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

describe("shouldArmNotificationNav", () => {
  it("arms the click target when the app is backgrounded", () => {
    strictEqual(shouldArmNotificationNav(false, false), true);
  });

  // Regression for focused Windows/Linux: user can be in another Houston chat,
  // click the toast, and still navigate because the native click event is the
  // consume signal.
  it("arms while focused when a native click event exists", () => {
    strictEqual(shouldArmNotificationNav(true, true), true);
  });

  // macOS has no desktop click event from the JS plugin, so focus is the click
  // proxy there. Don't arm while already focused or a later refocus could yank.
  it("does not arm while focused when focus is the only click signal", () => {
    strictEqual(shouldArmNotificationNav(true, false), false);
  });
});

describe("shouldNavigateOnAppActivation", () => {
  it("navigates on app activation only on macOS (no desktop click event there)", () => {
    strictEqual(shouldNavigateOnAppActivation(true), true);
  });

  // Regression for the refocus-yank: on Linux/Windows a plain foregrounding
  // (alt-tab, taskbar, resume) must NOT navigate — only the distinct
  // notification-clicked event does. Otherwise returning to Houston after a
  // mission finished in the background throws the user into that mission.
  it("does not navigate on app activation on Linux/Windows", () => {
    strictEqual(shouldNavigateOnAppActivation(false), false);
  });
});
