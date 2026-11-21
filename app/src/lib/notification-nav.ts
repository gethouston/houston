export interface NavAgent {
  id: string;
  name: string;
  folderPath: string;
}

export interface NotificationNav {
  agentId: string;
  sessionKey: string;
}

export interface AssistantNotificationNav {
  assistant: true;
}

export type NotificationClickTarget =
  | NotificationNav
  | AssistantNotificationNav;

export interface NotificationTarget {
  agentName: string;
  nav?: NotificationNav;
}

export function resolveNotificationTarget(
  agents: NavAgent[],
  agentPath: string,
  sessionKey: string,
  fallbackAgentName: string,
): NotificationTarget {
  const finishedAgent = agents.find((a) => a.folderPath === agentPath);
  const agentName = finishedAgent?.name ?? fallbackAgentName;

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
  pendingActivityId: string | null;
  forceOpen?: boolean;
  selectedId: string | null;
  missionPanelOpen: boolean;
}

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

export function shouldArmNotificationNav(
  windowFocused: boolean,
  hasNativeClickEvent: boolean,
): boolean {
  return hasNativeClickEvent || !windowFocused;
}

export function shouldNavigateOnAppActivation(isMacPlatform: boolean): boolean {
  return isMacPlatform;
}
