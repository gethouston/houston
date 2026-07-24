/**
 * Runtime for session-notification onboarding: the in-app on/off toggle, the
 * live OS/browser permission read + request, and the persisted flags that make
 * the pre-prompt and missed-ping catch-net one-time.
 *
 * The pure decision logic (what to show, how to label it) lives in
 * `notification-permission.ts`; this module is the DOM/Tauri/prefs side. The
 * in-app toggle is cached synchronously so the send chokepoint
 * (`session-notifications.ts`) can gate without an await.
 */

import {
  mapBrowserPermission,
  type NotificationPermissionState,
} from "./notification-permission";
import { osIsTauri } from "./os-bridge";
import { isMac } from "./platform";
import { tauriPreferences } from "./tauri";

// Absence = ON (features default ON — the preference only records an explicit
// OFF). The pre-prompt / catch-net flags are "true" once set, absent otherwise.
const ENABLED_KEY = "notifications_enabled";
const PREPROMPT_ASKED_KEY = "notifications_preprompt_asked";
const MISSED_PING_KEY = "notifications_missed_ping";
const CATCHNET_DISMISSED_KEY = "notifications_catchnet_dismissed";

/**
 * Synchronous mirror of the in-app toggle, so the send path can gate without an
 * await. Defaults ON and is hydrated by `loadNotificationSettings()` at startup;
 * a not-yet-loaded cache therefore fails OPEN (notifications on), never silently
 * off.
 */
let inAppEnabledCache = true;

/** The in-app toggle's current value (sync, from cache). */
export function isSessionNotificationEnabled(): boolean {
  return inAppEnabledCache;
}

/** Hydrate the sync cache from persisted prefs. Call once at app start. */
export async function loadNotificationSettings(): Promise<void> {
  const stored = await tauriPreferences.get(ENABLED_KEY);
  inAppEnabledCache = stored !== "false";
}

/**
 * Persist the in-app toggle. ON clears the pref (absence = ON); OFF writes the
 * explicit "false". Updates the sync cache immediately so the gate is coherent
 * even before the write lands.
 */
export async function setSessionNotificationEnabled(
  enabled: boolean,
): Promise<void> {
  inAppEnabledCache = enabled;
  await tauriPreferences.set(ENABLED_KEY, enabled ? null : "false");
}

/**
 * Whether the OS (desktop) / browser (web) will actually deliver a notification
 * right now. Linux/Windows desktop have no per-app permission gate, so they
 * always report granted; macOS reads the plugin, web reads `Notification`.
 */
export async function readOsPermissionGranted(): Promise<boolean> {
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

/**
 * Fire the real OS/browser permission request (the contextual CTAs' payload).
 * macOS uses the plugin, web uses `Notification.requestPermission`; Linux/
 * Windows desktop have no dialog and report granted.
 */
export async function requestOsPermission(): Promise<NotificationPermissionState> {
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

// ── One-time flags ────────────────────────────────────────────────────

/** Whether the first-mission pre-prompt has already been shown. */
export async function hasPrepromptAsked(): Promise<boolean> {
  return (await tauriPreferences.get(PREPROMPT_ASKED_KEY)) === "true";
}

/** Record that the first-mission pre-prompt was shown (so it never repeats). */
export async function markPrepromptAsked(): Promise<void> {
  await tauriPreferences.set(PREPROMPT_ASKED_KEY, "true");
}

/** Whether a completion notification was missed and not yet resolved. */
export async function hasMissedPing(): Promise<boolean> {
  return (await tauriPreferences.get(MISSED_PING_KEY)) === "true";
}

/** Record that a completion notification could not be delivered. */
export async function recordMissedPing(): Promise<void> {
  await tauriPreferences.set(MISSED_PING_KEY, "true");
}

/** Clear the missed-ping flag (permission was granted — nothing left to fix). */
export async function clearMissedPing(): Promise<void> {
  await tauriPreferences.set(MISSED_PING_KEY, null);
}

/** Whether the catch-net callout has already been shown/dismissed. */
export async function hasCatchNetDismissed(): Promise<boolean> {
  return (await tauriPreferences.get(CATCHNET_DISMISSED_KEY)) === "true";
}

/** Record that the catch-net callout was shown (so it never repeats). */
export async function markCatchNetDismissed(): Promise<void> {
  await tauriPreferences.set(CATCHNET_DISMISSED_KEY, "true");
}
