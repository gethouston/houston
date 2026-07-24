import { Switch } from "@houston-ai/core";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../../lib/error-toast";
import {
  type NotificationRowState,
  notificationRowState,
} from "../../../lib/notification-permission";
import {
  readOsPermissionGranted,
  requestOsPermission,
  setSessionNotificationEnabled,
} from "../../../lib/notification-settings";
import { osIsTauri, osOpenNotificationSettings } from "../../../lib/os-bridge";
import { currentPlatformOs } from "../../../lib/platform";
import { useUIStore } from "../../../stores/ui";
import { SettingsControlRow } from "../settings-row";

const STATE_KEY: Record<NotificationRowState, string> = {
  on: "notifications.state.on",
  offInApp: "notifications.state.off",
  osBlocked: "notifications.state.osBlocked",
  browserBlocked: "notifications.state.browserBlocked",
};

const isWeb = !osIsTauri();
// Only macOS + Windows expose a notification-settings pane we can open; web has
// none and Linux reports the command unsupported, so we hide the button there.
const canOpenSettings =
  osIsTauri() &&
  (currentPlatformOs === "macos" || currentPlatformOs === "windows");

/**
 * The Settings notifications row: an in-app toggle (default ON, preference-
 * backed) plus a live label of the real delivery truth — On / Off / Off in the
 * OS / Blocked in the browser — refreshed whenever the window regains focus so
 * a permission change made in System Settings shows without a reload.
 */
export function NotificationsSection() {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [osGranted, setOsGranted] = useState(true);

  const refreshOsGranted = useCallback(() => {
    readOsPermissionGranted()
      .then(setOsGranted)
      .catch(() => {
        // A failed probe is not a user action; leave the last known value.
      });
  }, []);

  useEffect(() => {
    refreshOsGranted();
    window.addEventListener("focus", refreshOsGranted);
    return () => window.removeEventListener("focus", refreshOsGranted);
  }, [refreshOsGranted]);

  const handleToggle = async (next: boolean) => {
    setInAppEnabled(next);
    try {
      await setSessionNotificationEnabled(next);
      // Turning the toggle ON while delivery isn't granted is the user's cue to
      // grant it: request permission right here (the contextual ask), then
      // reflect the result.
      if (next && !osGranted) {
        const state = await requestOsPermission();
        setOsGranted(state === "granted");
      }
    } catch (err) {
      setInAppEnabled(!next);
      addToast({
        title: t("settings:notifications.toggleFailed"),
        description: genericErrorDescription("notifications_toggle", err),
        variant: "error",
      });
    }
  };

  const handleOpenSettings = async () => {
    try {
      await osOpenNotificationSettings();
    } catch (err) {
      addToast({
        title: t("common:notifications.openSettingsFailed", {
          error: String(err),
        }),
        variant: "error",
      });
    }
  };

  const rowState = notificationRowState({ inAppEnabled, osGranted, isWeb });
  const showOpenSettings = canOpenSettings && inAppEnabled && !osGranted;

  return (
    <SettingsControlRow
      icon={Bell}
      title={t("settings:notifications.title")}
      description={t("settings:notifications.description")}
    >
      <div className="flex items-center gap-3">
        {showOpenSettings && (
          <button
            type="button"
            onClick={() => void handleOpenSettings()}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-chip hover:text-ink"
          >
            {t("settings:notifications.openSettings")}
          </button>
        )}
        <span className="text-sm text-ink-muted">
          {t(`settings:${STATE_KEY[rowState]}`)}
        </span>
        <Switch
          checked={inAppEnabled}
          onCheckedChange={(v) => void handleToggle(v)}
          aria-label={t("settings:notifications.title")}
        />
      </div>
    </SettingsControlRow>
  );
}
