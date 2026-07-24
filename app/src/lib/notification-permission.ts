/**
 * Pure, DOM-free logic for the session-notification onboarding surfaces:
 * permission-state mapping, the first-mission pre-prompt gate, and the
 * missed-ping catch-net state machine.
 *
 * Kept free of `Notification`, Tauri, and store imports so it unit-tests under
 * `node --test` (see `app/tests/notification-permission.test.ts`). The runtime
 * that actually reads the OS permission and persists flags lives in
 * `notification-settings.ts`; this module only decides *what should happen*.
 */

/** Normalized notification permission, unified across web + desktop. */
export type NotificationPermissionState = "granted" | "denied" | "default";

/** The label a Settings notifications row shows for the current live truth. */
export type NotificationRowState =
  | "on" // in-app enabled AND the OS/browser grants delivery
  | "offInApp" // the user turned the in-app toggle off
  | "osBlocked" // in-app enabled but the desktop OS blocks delivery
  | "browserBlocked"; // in-app enabled but the browser blocks delivery

/** Map the browser `Notification.permission` string to our normalized state. */
export function mapBrowserPermission(
  permission: NotificationPermission,
): NotificationPermissionState {
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

/**
 * Resolve the Settings row's live label. The in-app toggle is the outer gate
 * (its OFF is an explicit user act); when it's on, the OS/browser truth decides
 * whether delivery actually reaches the user.
 */
export function notificationRowState(args: {
  inAppEnabled: boolean;
  osGranted: boolean;
  isWeb: boolean;
}): NotificationRowState {
  if (!args.inAppEnabled) return "offInApp";
  if (args.osGranted) return "on";
  return args.isWeb ? "browserBlocked" : "osBlocked";
}

/**
 * Whether the first-mission pre-prompt should surface. One-time and contextual:
 * only when delivery isn't already granted and we've never asked before (the
 * asked flag is persisted the moment we show it, so it never repeats).
 */
export function shouldShowFirstMissionPrompt(args: {
  osGranted: boolean;
  askedBefore: boolean;
}): boolean {
  return !args.osGranted && !args.askedBefore;
}

/**
 * Whether a completion notification that just could not be delivered should
 * record a missed ping. It only counts when the user WANTS notifications
 * (in-app toggle on) but the OS/browser wouldn't deliver: a toggle-off is a
 * deliberate silence, not a miss.
 */
export function shouldRecordMissedPing(args: {
  inAppEnabled: boolean;
  osGranted: boolean;
}): boolean {
  return args.inAppEnabled && !args.osGranted;
}

/**
 * Whether the missed-ping catch-net callout should surface on the next app
 * focus. Never once permission was granted (nothing to fix) and never again
 * after the user dismisses it.
 */
export function shouldShowCatchNet(args: {
  missedPingPending: boolean;
  dismissed: boolean;
  osGranted: boolean;
}): boolean {
  return args.missedPingPending && !args.dismissed && !args.osGranted;
}
