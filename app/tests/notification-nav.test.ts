import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  activityIdForSessionKey,
  type NavAgent,
  resolveNotificationTarget,
  resolvePendingActivitySelection,
  shouldArmNotificationNav,
  shouldNavigateOnAppActivation,
} from "../src/lib/notification-nav.ts";

const agents: NavAgent[] = [
  { id: "a1", name: "Researcher", folderPath: "/ws/Researcher" },
  { id: "a2", name: "Writer", folderPath: "/ws/Writer" },
];

describe("resolveNotificationTarget", () => {
  it("targets the agent that finished, matched by folder path", () => {
    deepStrictEqual(
      resolveNotificationTarget(
        agents,
        "/ws/Writer",
        "activity-act99",
        "Writer",
      ),
      {
        agentName: "Writer",
        nav: { agentId: "a2", sessionKey: "activity-act99" },
      },
    );
  });

  it("targets the finished agent even when a different agent is open", () => {
    deepStrictEqual(
      resolveNotificationTarget(
        agents,
        "/ws/Writer",
        "activity-act99",
        "Researcher",
      ),
      {
        agentName: "Writer",
        nav: { agentId: "a2", sessionKey: "activity-act99" },
      },
    );
  });

  it("falls back to the open agent name and sets no nav when the finished agent isn't loaded", () => {
    deepStrictEqual(
      resolveNotificationTarget(
        agents,
        "/ws/Archived",
        "activity-act1",
        "Researcher",
      ),
      { agentName: "Researcher" },
    );
  });

  it("arms the routine chat's session key for navigation", () => {
    deepStrictEqual(
      resolveNotificationTarget(
        agents,
        "/ws/Writer",
        "routine-r1",
        "Researcher",
      ),
      { agentName: "Writer", nav: { agentId: "a2", sessionKey: "routine-r1" } },
    );
  });

  it("sets no nav for non-chat session keys", () => {
    deepStrictEqual(
      resolveNotificationTarget(agents, "/ws/Writer", "main", "Researcher"),
      { agentName: "Writer" },
    );
  });
});

describe("activityIdForSessionKey", () => {
  it("resolves a routine key to the activity id stored on the row", () => {
    const activities = [
      { id: "act-1", session_key: "activity-act-1" },
      { id: "act-routine", session_key: "routine-r1" },
    ];
    strictEqual(
      activityIdForSessionKey(activities, "routine-r1"),
      "act-routine",
    );
  });

  it("resolves a standard mission key whose row has no explicit session_key", () => {
    const activities = [{ id: "act99" }];
    strictEqual(activityIdForSessionKey(activities, "activity-act99"), "act99");
  });

  it("falls back to the encoded id when the activity row isn't in the list", () => {
    strictEqual(activityIdForSessionKey([], "activity-act99"), "act99");
  });

  it("returns null for a routine key with no matching activity", () => {
    strictEqual(activityIdForSessionKey([], "routine-r1"), null);
  });
});

describe("resolvePendingActivitySelection", () => {
  it("returns null when no same-agent navigation is pending", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: null,
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
        selectedId: null,
        missionPanelOpen: true,
      }),
      null,
    );
  });

  it("returns null when nothing is pending", () => {
    strictEqual(
      resolvePendingActivitySelection({
        pendingActivityId: null,
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

  it("arms while focused when a native click event exists", () => {
    strictEqual(shouldArmNotificationNav(true, true), true);
  });

  it("does not arm while focused when focus is the only click signal", () => {
    strictEqual(shouldArmNotificationNav(true, false), false);
  });
});

describe("shouldNavigateOnAppActivation", () => {
  it("navigates on app activation only on macOS (no desktop click event there)", () => {
    strictEqual(shouldNavigateOnAppActivation(true), true);
  });

  it("does not navigate on app activation on Linux/Windows", () => {
    strictEqual(shouldNavigateOnAppActivation(false), false);
  });
});
