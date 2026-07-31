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
  /**
   * Session key of the finished chat — `activity-{id}` for a standard mission,
   * `routine-{routine_id}` for a routine (#401). Resolved to a board activity
   * id at click time (`consumePendingNav` → `activityIdForSessionKey`) rather
   * than here, because a routine's chat is created right *after* its session
   * completes, so the activity may not exist yet when the notification fires.
   */
  sessionKey: string;
}

export interface NotificationTarget {
  /** Agent name for the notification title (the agent that finished). */
  agentName: string;
  /** Click target, set only when the finished session maps to a chat. */
  nav?: NotificationNav;
}

/**
 * Match the finished session to its agent by **folder path**, not by whichever
 * agent the user currently has open. This is what lets a notification click
 * jump to the agent + chat that completed even after the user switched agents
 * or closed the chat — `consumePendingNav()` switches the active agent for us,
 * so the only thing missing was a target that survives the switch.
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

  // Any finished chat is navigable: standard missions (`activity-{id}`) and
  // routine chats (`routine-{routine_id}`, #401). The key is resolved to a
  // board activity id at click time. Non-chat sessions (e.g. the bare `main`
  // key) carry no board card and simply don't arm a target.
  const opensAChat =
    sessionKey.startsWith("activity-") || sessionKey.startsWith("routine-");

  if (finishedAgent && opensAChat) {
    return {
      agentName,
      nav: { agentId: finishedAgent.id, sessionKey },
    };
  }

  return { agentName };
}

/**
 * Resolve a finished session's key to the board activity id to open.
 *
 * Standard mission chats are keyed `activity-{id}`; the row usually has no
 * explicit `session_key`, so the board derives `activity-{id}` from the id.
 * Routine chats use the routine's stable `routine-{routine_id}` key (#381),
 * stored explicitly as `session_key` on an activity whose own id is unrelated.
 * Mirror the board's exact derivation (`session_key ?? activity-{id}`) so the
 * lookup round-trips for both. The `activity-` prefix fallback covers the case
 * where the matching row isn't in `activities` (preserving the prior
 * strip-and-trust behavior for standard missions).
 *
 * Pure + store-free so it's unit-testable; the caller fetches the list.
 */
export function activityIdForSessionKey(
  activities: { id: string; session_key?: string }[],
  sessionKey: string,
): string | null {
  const match = activities.find(
    (a) => (a.session_key ?? `activity-${a.id}`) === sessionKey,
  );
  if (match) return match.id;
  if (sessionKey.startsWith("activity-")) {
    return sessionKey.slice("activity-".length);
  }
  return null;
}

export interface PendingActivityArgs {
  /** Published nav target (`activityPanelId`), or null when none is pending. */
  pendingActivityId: string | null;
  /** Explicit user navigation, such as a notification click, may replace an open chat. */
  forceOpen?: boolean;
  /** Activity whose chat is currently open on the board, or null. */
  selectedId: string | null;
  /** Whether a chat / New Mission panel is currently open over the board. */
  missionPanelOpen: boolean;
}

/**
 * Decide which activity the active BoardTab should select when an
 * `activityPanelId` nav is published (notification click, command palette,
 * Mission Control). Returns the activity id to open, or null to open nothing.
 *
 * The keyed agent subtree mounts a fresh board for cross-agent navigation. This
 * helper therefore owns only same-agent guards: a passive nav must not yank the
 * user out of an open conversation or composer.
 */
export function resolvePendingActivitySelection({
  pendingActivityId,
  forceOpen = false,
  selectedId,
  missionPanelOpen,
}: PendingActivityArgs): string | null {
  if (!pendingActivityId) return null;
  if (forceOpen) return pendingActivityId;
  if (selectedId || missionPanelOpen) return null;
  return pendingActivityId;
}

/**
 * Whether a session-finished notification should arm its click-to-navigate
 * target. Linux/Windows have a distinct native click event, so arming while
 * focused is safe and required: the user may click the toast while working in a
 * different Houston chat. macOS has no desktop click event in the JS plugin, so
 * focus is the click proxy there and we only arm while backgrounded.
 */
export function shouldArmNotificationNav(
  windowFocused: boolean,
  hasNativeClickEvent: boolean,
): boolean {
  return hasNativeClickEvent || !windowFocused;
}

/**
 * Whether a generic app foregrounding (`app-activated` / window focus) should
 * consume the pending notification nav and jump to the finished mission.
 *
 * Only on macOS. There the JS notification plugin exposes no desktop click
 * event, so a notification click only manifests as the app activating — focus
 * is the sole signal. On Linux/Windows the Rust click handler (`notification.rs`)
 * emits a distinct `notification-clicked` event, so nav is driven by that real
 * click alone; navigating on any other refocus (alt-tab, dock click, resume)
 * would yank the user out of whatever they were doing when a mission finished in
 * the background. See `hooks/use-session-events.ts` + `session-notifications.ts`.
 */
export function shouldNavigateOnAppActivation(isMacPlatform: boolean): boolean {
  return isMacPlatform;
}

/**
 * Where a consumed skill-setup-chat notification should land, given where the
 * user actually is. A skill chat lives on TWO surfaces — the owning agent's
 * Skills section and the global Skills page (HOU-792's create flow) — and on
 * macOS a bare refocus consumes the nav too (focus is the click proxy, see
 * `shouldNavigateOnAppActivation`). HOU-980 set the rule for integration
 * chats: never yank a user who is already on a surface hosting the chat.
 *
 * - `"stay"` — the user is on the global Skills page; an open chat is already
 *   visible there (it renders in the page's own right panel), and a closed
 *   one was closed deliberately. Touch nothing.
 * - `"reopen-in-place"` — the user is on THIS agent's Skills section; arm the
 *   one-shot activity id so a closed chat reopens on the spot, no view change.
 * - `"navigate"` — anywhere else: a genuine jump to the agent's Skills
 *   section, the chat's home.
 */
export function skillChatNavDecision(args: {
  prevViewMode: string;
  prevAgentId: string | undefined;
  /** The Agent Settings sub-target when `prevViewMode` is "job-description". */
  jobDescriptionTarget: string | null;
  /** The agent hosting the finished skill chat. */
  agentId: string;
  /** The global Skills page's view id (`SKILLS_VIEW_ID`). */
  skillsHomeViewId: string;
}): "stay" | "reopen-in-place" | "navigate" {
  if (args.prevViewMode === args.skillsHomeViewId) return "stay";
  const onOwnSkillsSection =
    args.prevViewMode === "job-description" &&
    args.jobDescriptionTarget === "skills" &&
    args.prevAgentId === args.agentId;
  return onOwnSkillsSection ? "reopen-in-place" : "navigate";
}
