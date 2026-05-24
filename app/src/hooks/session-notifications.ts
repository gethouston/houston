import { getCurrentWindow } from "@tauri-apps/api/window";

import { logger } from "../lib/logger";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";

interface NotificationNav {
  agentId: string;
  activityId: string;
}

let pendingNotificationNav: NotificationNav | null = null;
let pendingNavTimer: ReturnType<typeof setTimeout> | null = null;

export function describePendingNotificationNav() {
  return JSON.stringify(pendingNotificationNav);
}

export function consumePendingNav() {
  if (!pendingNotificationNav) return;
  const { agentId, activityId } = pendingNotificationNav;
  pendingNotificationNav = null;
  if (pendingNavTimer) {
    clearTimeout(pendingNavTimer);
    pendingNavTimer = null;
  }

  const agents = useAgentStore.getState().agents;
  logger.debug(
    `[notification] consuming nav: agentId=${agentId} activityId=${activityId} agents=[${agents.map((a) => a.id).join(",")}]`,
  );
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    logger.debug("[notification] agent not found, cannot navigate");
    return;
  }

  logger.debug(
    `[notification] navigating to agent=${agent.name} activity=${activityId}`,
  );
  useUIStore.getState().setViewMode("activity");
  useAgentStore.getState().setCurrent(agent);
  useUIStore.getState().setActivityPanelId(activityId);
}

export async function sendSessionNotification(
  title: string,
  body: string,
  nav?: NotificationNav,
) {
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification: notify,
    } = await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (!granted) return;

    notify({ title, body, sound: "Glass" });
    if (!nav) return;

    pendingNotificationNav = nav;
    if (pendingNavTimer) clearTimeout(pendingNavTimer);
    pendingNavTimer = setTimeout(
      () => {
        pendingNotificationNav = null;
      },
      5 * 60 * 1000,
    );
    logger.debug(
      `[notification] pending nav set: agentId=${nav.agentId} activityId=${nav.activityId}`,
    );

    const focused = await getCurrentWindow().isFocused();
    if (focused) {
      logger.debug(
        "[notification] window already focused, navigating immediately",
      );
      consumePendingNav();
    }
  } catch (e) {
    console.error("[notification] Failed:", e);
  }
}

export function listenForNotificationFocus(): Promise<() => void> | undefined {
  try {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || !pendingNotificationNav) return;
      logger.debug(
        `[notification] onFocusChanged fired: focused=${focused} pendingNav=${JSON.stringify(pendingNotificationNav)}`,
      );
      consumePendingNav();
    });
  } catch (e) {
    logger.debug(`[notification] Tauri focus listener unavailable: ${e}`);
    return undefined;
  }
}
