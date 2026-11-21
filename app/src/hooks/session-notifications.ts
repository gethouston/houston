import { getCurrentWindow } from "@tauri-apps/api/window";
import { ASSISTANT_VIEW_ID } from "../components/assistant/id";
import { logger } from "../lib/logger";
import {
  type NotificationClickTarget,
  shouldArmNotificationNav,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import {
  isSessionNotificationEnabled,
  readOsPermissionGranted,
  recordMissedPing,
} from "../lib/notification-settings";
import { osIsTauri, osShowSessionNotification } from "../lib/os-bridge";
import { osIsNativeMobile } from "../lib/os-bridge/platform";
import { isMac } from "../lib/platform";
import { useUIStore } from "../stores/ui";
import { navigateToNotificationTarget } from "./session-notification-navigate";

let pendingNotificationNav: NotificationClickTarget | null = null;
let pendingNavTimer: ReturnType<typeof setTimeout> | null = null;

export function describePendingNotificationNav() {
  return JSON.stringify(pendingNotificationNav);
}

export async function consumePendingNav() {
  if (!pendingNotificationNav) return;
  const nav = pendingNotificationNav;
  pendingNotificationNav = null;
  if (pendingNavTimer) {
    clearTimeout(pendingNavTimer);
    pendingNavTimer = null;
  }
  if ("assistant" in nav) {
    useUIStore.getState().setViewMode(ASSISTANT_VIEW_ID);
    return;
  }
  await navigateToNotificationTarget(nav);
}

export async function sendSessionNotification(
  title: string,
  body: string,
  nav?: NotificationClickTarget,
) {
  if (osIsNativeMobile()) return;
  try {
    if (!isSessionNotificationEnabled()) return;

    if (!(await readOsPermissionGranted())) {
      await recordMissedPing();
      return;
    }

    if (isMac || !osIsTauri()) {
      const { sendNotification: notify } = await import(
        "@tauri-apps/plugin-notification"
      );
      notify({ title, body, sound: "Glass" });
    } else {
      await osShowSessionNotification(title, body);
    }

    if (!nav) return;

    const focused = await getCurrentWindow().isFocused();
    if (!shouldArmNotificationNav(focused, !isMac)) return;

    pendingNotificationNav = nav;
    if (pendingNavTimer) clearTimeout(pendingNavTimer);
    pendingNavTimer = setTimeout(
      () => {
        pendingNotificationNav = null;
      },
      5 * 60 * 1000,
    );
    logger.debug(`[notification] pending nav set: ${JSON.stringify(nav)}`);
  } catch (e) {
    logger.error(`[notification] Failed: ${e}`);
  }
}

export function listenForNotificationFocus(): Promise<() => void> | undefined {
  if (!shouldNavigateOnAppActivation(isMac)) return undefined;
  try {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || !pendingNotificationNav) return;
      logger.debug(
        `[notification] onFocusChanged fired: focused=${focused} pendingNav=${JSON.stringify(pendingNotificationNav)}`,
      );
      consumePendingNav().catch((e) => {
        logger.error(`[notification] consumePendingNav (focus) failed: ${e}`);
      });
    });
  } catch (e) {
    logger.debug(`[notification] Tauri focus listener unavailable: ${e}`);
    return undefined;
  }
}
