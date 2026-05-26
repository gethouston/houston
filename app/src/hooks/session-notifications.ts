import { getCurrentWindow } from "@tauri-apps/api/window";

import { logger } from "../lib/logger";
import { isMac } from "../lib/platform";
import { shouldArmNotificationNav, shouldNavigateOnAppActivation } from "../lib/notification-nav";
import { osShowSessionNotification } from "../lib/os-bridge";
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
  logger.debug(`[notification] consuming nav: agentId=${agentId} activityId=${activityId} agents=[${agents.map(a => a.id).join(",")}]`);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    logger.debug("[notification] agent not found, cannot navigate");
    return;
  }

  logger.debug(`[notification] navigating to agent=${agent.name} activity=${activityId}`);
  useUIStore.getState().setViewMode("activity");
  useAgentStore.getState().setCurrent(agent);
  useUIStore.getState().setActivityPanelId(activityId, { forceOpen: true });
}

export async function sendSessionNotification(
  title: string,
  body: string,
  nav?: NotificationNav,
) {
  try {
    if (isMac) {
      // macOS: the JS notification plugin's click activates the app, which
      // fires the focus event the listener below consumes. Unchanged.
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
    } else {
      // Linux/Windows: the plugin is fire-and-forget (no click event) and a
      // notification click doesn't focus the window, so the focus path never
      // fires. The Rust command shows a native notification whose click raises
      // the window and emits `notification-clicked`.
      await osShowSessionNotification(title, body);
    }

    if (!nav) return;

    // Linux/Windows emit a real `notification-clicked` event, so arm even while
    // focused: the user can click the toast from another Houston chat and that
    // explicit click should navigate. macOS has no desktop click event in the
    // JS plugin, so focus is its click proxy and we only arm while backgrounded.
    const focused = await getCurrentWindow().isFocused();
    if (!shouldArmNotificationNav(focused, !isMac)) return;

    pendingNotificationNav = nav;
    if (pendingNavTimer) clearTimeout(pendingNavTimer);
    pendingNavTimer = setTimeout(() => {
      pendingNotificationNav = null;
    }, 5 * 60 * 1000);
    logger.debug(`[notification] pending nav set: agentId=${nav.agentId} activityId=${nav.activityId}`);
  } catch (e) {
    logger.error(`[notification] Failed: ${e}`);
  }
}

export function listenForNotificationFocus(): Promise<() => void> | undefined {
  // macOS only. There a notification click surfaces as window focus (the JS
  // plugin gives no desktop click event), so focus is the navigate signal. On
  // Linux/Windows the Rust click handler emits the distinct
  // `notification-clicked` event instead, and consuming on focus here would
  // yank the user back to a finished mission on any refocus.
  if (!shouldNavigateOnAppActivation(isMac)) return undefined;
  try {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || !pendingNotificationNav) return;
      logger.debug(`[notification] onFocusChanged fired: focused=${focused} pendingNav=${JSON.stringify(pendingNotificationNav)}`);
      consumePendingNav();
    });
  } catch (e) {
    logger.debug(`[notification] Tauri focus listener unavailable: ${e}`);
    return undefined;
  }
}
