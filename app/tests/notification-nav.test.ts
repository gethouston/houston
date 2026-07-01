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

  // Regression for the cross-agent bug: user is on "Researcher" (the fallback)
  // when "Writer" finishes in the background. The click target must still point
  // at Writer + its chat, not stay on the open agent / go nowhere.
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

  // Regression for #401: a routine that finishes with a chat result must arm a
  // click target so the notification opens the routine's chat (it used to be
  // excluded, so the click stayed on the last non-routine chat). The routine's
  // stable key is carried through and resolved to its activity id at click time.
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
    // The routine chat's activity id is unrelated to its `routine-{id}` key —
    // only the stored `session_key` links them (#381/#401).
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
    // Normal activities omit `session_key`; the board derives `activity-{id}`,
    // and so must this lookup.
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
