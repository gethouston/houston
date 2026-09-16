import { getCurrentWindow } from "@tauri-apps/api/window";
import { logger } from "../lib/logger";
import {
  type NotificationNav,
  shouldArmNotificationNav,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import {
  isSessionNotificationEnabled,
  readOsPermissionGranted,
  recordMissedPing,
} from "../lib/notification-settings";
import { osIsTauri, osShowSessionNotification } from "../lib/os-bridge";
import { isMac } from "../lib/platform";
import { navigateToNotificationTarget } from "./session-notification-navigate";

let pendingNotificationNav: NotificationNav | null = null;
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
  await navigateToNotificationTarget(nav);
}

export async function sendSessionNotification(
  title: string,
  body: string,
  nav?: NotificationNav,
) {
  try {
    // The send chokepoint gate: the in-app toggle OFF suppresses everything.
    if (!isSessionNotificationEnabled()) return;

    // If the OS/browser won't deliver, record a missed ping for the catch-net
    // and stop. We deliberately no longer force a context-less permission prompt
    // here — the ask now happens through the pre-prompt, the settings row, and
    // the catch-net CTAs, so the permission is always requested WITH context.
    if (!(await readOsPermissionGranted())) {
      await recordMissedPing();
      return;
    }

    if (isMac || !osIsTauri()) {
      // macOS + web: the JS notification plugin (shimmed to the browser
      // Notification API on web) whose click activates the app, firing the
      // focus event the listener below consumes.
      const { sendNotification: notify } = await import(
        "@tauri-apps/plugin-notification"
      );
      notify({ title, body, sound: "Glass" });
    } else {
      // Linux/Windows desktop: the plugin is fire-and-forget (no click event)
      // and a notification click doesn't focus the window, so the focus path
      // never fires. The Rust command shows a native notification whose click
      // raises the window and emits `notification-clicked`.
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
    pendingNavTimer = setTimeout(
      () => {
        pendingNotificationNav = null;
      },
      5 * 60 * 1000,
    );
    logger.debug(
      `[notification] pending nav set: agentId=${nav.agentId} sessionKey=${nav.sessionKey}`,
    );
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
