export type NotificationPermissionState = "granted" | "denied" | "default";

export type NotificationRowState =
  | "on"
  | "offInApp"
  | "osBlocked"
  | "browserBlocked";

export function mapBrowserPermission(
  permission: NotificationPermission,
): NotificationPermissionState {
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

export function notificationRowState(args: {
  inAppEnabled: boolean;
  osGranted: boolean;
  isWeb: boolean;
}): NotificationRowState {
  if (!args.inAppEnabled) return "offInApp";
  if (args.osGranted) return "on";
  return args.isWeb ? "browserBlocked" : "osBlocked";
}

export function shouldShowFirstMissionPrompt(args: {
  osGranted: boolean;
  askedBefore: boolean;
}): boolean {
  return !args.osGranted && !args.askedBefore;
}

export function shouldRecordMissedPing(args: {
  inAppEnabled: boolean;
  osGranted: boolean;
}): boolean {
  return args.inAppEnabled && !args.osGranted;
}

export function shouldShowCatchNet(args: {
  missedPingPending: boolean;
  dismissed: boolean;
  osGranted: boolean;
}): boolean {
  return args.missedPingPending && !args.dismissed && !args.osGranted;
}
