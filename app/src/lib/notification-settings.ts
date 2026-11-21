import { nativeShell } from "../../../packages/web/src/shims/native-shell";
import {
  mapBrowserPermission,
  type NotificationPermissionState,
} from "./notification-permission";
import { osIsTauri } from "./os-bridge";
import { osIsNativeMobile } from "./os-bridge/platform";
import { isMac } from "./platform";
import { tauriPreferences } from "./tauri";

const ENABLED_KEY = "notifications_enabled";
const PREPROMPT_ASKED_KEY = "notifications_preprompt_asked";
const MISSED_PING_KEY = "notifications_missed_ping";
const CATCHNET_DISMISSED_KEY = "notifications_catchnet_dismissed";

let inAppEnabledCache = true;

export function isSessionNotificationEnabled(): boolean {
  return inAppEnabledCache;
}

export function nativePushAvailable(): boolean {
  return !osIsNativeMobile() || nativeShell()?.push.available === true;
}

export async function loadNotificationSettings(): Promise<void> {
  const stored = await tauriPreferences.get(ENABLED_KEY);
  inAppEnabledCache = stored !== "false";
}

export async function setSessionNotificationEnabled(
  enabled: boolean,
): Promise<void> {
  inAppEnabledCache = enabled;
  await tauriPreferences.set(ENABLED_KEY, enabled ? null : "false");
  if (osIsNativeMobile()) window.dispatchEvent(new Event("push-toggle"));
}

export async function readOsPermissionGranted(): Promise<boolean> {
  if (osIsNativeMobile())
    return (await nativeShell()?.push.permissionState()) === "granted";
  if (osIsTauri()) {
    if (!isMac) return true;
    const { isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    return isPermissionGranted();
  }
  return (
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
}

export async function requestOsPermission(): Promise<NotificationPermissionState> {
  if (osIsNativeMobile()) {
    const state = (await nativeShell()?.push.requestPermission()) ?? "denied";
    if (state === "granted") window.dispatchEvent(new Event("push-toggle"));
    return state;
  }
  if (osIsTauri()) {
    if (!isMac) return "granted";
    const { requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    const result = await requestPermission();
    return result === "granted"
      ? "granted"
      : result === "denied"
        ? "denied"
        : "default";
  }
  if (typeof Notification === "undefined") return "denied";
  return mapBrowserPermission(await Notification.requestPermission());
}

export async function hasPrepromptAsked(): Promise<boolean> {
  return (await tauriPreferences.get(PREPROMPT_ASKED_KEY)) === "true";
}

export async function markPrepromptAsked(): Promise<void> {
  await tauriPreferences.set(PREPROMPT_ASKED_KEY, "true");
}

export async function hasMissedPing(): Promise<boolean> {
  return (await tauriPreferences.get(MISSED_PING_KEY)) === "true";
}

export async function recordMissedPing(): Promise<void> {
  await tauriPreferences.set(MISSED_PING_KEY, "true");
}

export async function clearMissedPing(): Promise<void> {
  await tauriPreferences.set(MISSED_PING_KEY, null);
}

export async function hasCatchNetDismissed(): Promise<boolean> {
  return (await tauriPreferences.get(CATCHNET_DISMISSED_KEY)) === "true";
}

export async function markCatchNetDismissed(): Promise<void> {
  await tauriPreferences.set(CATCHNET_DISMISSED_KEY, "true");
}
