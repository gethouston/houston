/**
 * Resolve a session-finished notification's title + click-to-navigate target.
 *
 * Pure + store-free so it's unit-testable; the React hook
 * (`use-session-events.ts`) passes the loaded agent list in.
 */

/** Minimal agent shape this resolver needs from the agent store. */
export interface NavAgent {
  id: string;
  name: string;
  folderPath: string;
}

export interface NotificationNav {
  agentId: string;
  activityId: string;
}

export interface NotificationTarget {
  /** Agent name for the notification title (the agent that finished). */
  agentName: string;
  /** Click target, set only when the finished session maps to an activity. */
  nav?: NotificationNav;
}

/**
 * Match the finished session to its agent by **folder path**, not by whichever
 * agent the user currently has open. This is what lets a notification click
 * jump to the agent + activity that completed even after the user switched
 * agents or closed the chat — `consumePendingNav()` switches the active agent
 * for us, so the only thing missing was a target that survives the switch.
 *
 * `fallbackAgentName` is used for the title only when the finished agent isn't
 * in the loaded list (e.g. it lives in another workspace).
 */
export function resolveNotificationTarget(
  agents: NavAgent[],
  agentPath: string,
  sessionKey: string,
  fallbackAgentName: string,
): NotificationTarget {
  const finishedAgent = agents.find((a) => a.folderPath === agentPath);
  const agentName = finishedAgent?.name ?? fallbackAgentName;

  // Activity sessions are keyed `activity-<id>`. Routine runs are excluded:
  // they have no mission chat to open.
  const isActivitySession =
    sessionKey.startsWith("activity-") && !sessionKey.startsWith("routine-");

  if (finishedAgent && isActivitySession) {
    return {
      agentName,
      nav: {
        agentId: finishedAgent.id,
        activityId: sessionKey.replace("activity-", ""),
      },
    };
  }

  return { agentName };
}

export interface PendingActivityArgs {
  /** Published nav target (`activityPanelId`), or null when none is pending. */
  pendingActivityId: string | null;
  /** True only at the moment the board's active agent changed under it. */
  agentSwitched: boolean;
  /** Activity whose chat is currently open on the board, or null. */
  selectedId: string | null;
  /** Whether a chat / New Mission panel is currently open over the board. */
  missionPanelOpen: boolean;
}

/**
 * Decide which activity a reused BoardTab should select when an
 * `activityPanelId` nav is published (notification click, command palette,
 * Mission Control). Returns the activity id to open, or null to open nothing.
 *
 * The cross-agent rule: when the agent just switched, always adopt the target.
 * The guards that protect the current view — an open conversation (`selectedId`)
 * and a New Mission composer (`missionPanelOpen`) — describe the agent we just
 * LEFT. This board instance is reused across agents and `missionPanelOpen` lives
 * in the global UI store, so right after a switch it still reads the previous
 * agent's value (it lags until AIBoard reconciles) and would otherwise swallow
 * the nav, stranding the user on the right agent with no chat open. Without a
 * switch, keep the guards: a nav must not yank the user out of an open
 * conversation or composer on the agent they're already looking at.
 */
export function resolvePendingActivitySelection({
  pendingActivityId,
  agentSwitched,
  selectedId,
  missionPanelOpen,
}: PendingActivityArgs): string | null {
  if (!pendingActivityId) return null;
  if (agentSwitched) return pendingActivityId;
  if (selectedId || missionPanelOpen) return null;
  return pendingActivityId;
}
