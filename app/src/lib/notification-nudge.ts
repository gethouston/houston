import type { TFunction } from "i18next";
import type { ToastItem } from "../stores/ui";
import { logAndReportError } from "./error-report";
import { logger } from "./logger";
import {
  shouldShowCatchNet,
  shouldShowFirstMissionPrompt,
} from "./notification-permission";
import {
  clearMissedPing,
  hasCatchNetDismissed,
  hasMissedPing,
  hasPrepromptAsked,
  markCatchNetDismissed,
  markPrepromptAsked,
  nativePushAvailable,
  readOsPermissionGranted,
  requestOsPermission,
} from "./notification-settings";
import { osIsTauri, osOpenNotificationSettings } from "./os-bridge";
import { currentPlatformOs } from "./platform";

type AddToast = (toast: Omit<ToastItem, "id">) => void;

interface NudgeDeps {
  addToast: AddToast;
  t: TFunction;
}

function canOpenOsSettings(): boolean {
  return (
    osIsTauri() &&
    (currentPlatformOs === "macos" || currentPlatformOs === "windows")
  );
}

async function runPermissionCta(deps: NudgeDeps): Promise<void> {
  const { addToast, t } = deps;
  try {
    const state = await requestOsPermission();
    if (state === "granted") {
      await clearMissedPing();
      addToast({
        title: t("common:notifications.granted"),
        variant: "success",
      });
      return;
    }
    if (canOpenOsSettings()) {
      addToast({
        title: t("common:notifications.blocked"),
        action: {
          label: t("common:notifications.openSettings"),
          onClick: () => {
            osOpenNotificationSettings().catch((err) => {
              logAndReportError("open_notification_settings", err);
              addToast({
                title: t("common:notifications.openSettingsFailed"),
                variant: "error",
              });
            });
          },
        },
      });
    } else {
      addToast({ title: t("common:notifications.blockedBrowser") });
    }
  } catch (err) {
    logAndReportError("request_notification_permission", err);
    addToast({
      title: t("common:notifications.requestFailed"),
      variant: "error",
    });
  }
}

export async function maybeShowFirstMissionPrompt(
  deps: NudgeDeps,
): Promise<void> {
  if (!nativePushAvailable()) return;
  try {
    const [osGranted, askedBefore] = await Promise.all([
      readOsPermissionGranted(),
      hasPrepromptAsked(),
    ]);
    if (!shouldShowFirstMissionPrompt({ osGranted, askedBefore })) return;
    await markPrepromptAsked();
    const { addToast, t } = deps;
    addToast({
      title: t("common:notifications.preprompt.title"),
      description: t("common:notifications.preprompt.body"),
      action: {
        label: t("common:notifications.preprompt.cta"),
        onClick: () => void runPermissionCta(deps),
      },
    });
  } catch (err) {
    logger.debug(`[notification] pre-prompt check skipped: ${err}`);
  }
}

export async function maybeShowMissedPingCallout(
  deps: NudgeDeps,
): Promise<void> {
  if (!nativePushAvailable()) return;
  try {
    const [osGranted, missedPingPending, dismissed] = await Promise.all([
      readOsPermissionGranted(),
      hasMissedPing(),
      hasCatchNetDismissed(),
    ]);
    if (!shouldShowCatchNet({ missedPingPending, dismissed, osGranted }))
      return;
    await markCatchNetDismissed();
    const { addToast, t } = deps;
    addToast({
      title: t("common:notifications.catchNet.title"),
      description: t("common:notifications.catchNet.body"),
      action: {
        label: t("common:notifications.catchNet.cta"),
        onClick: () => void runPermissionCta(deps),
      },
    });
  } catch (err) {
    logger.debug(`[notification] catch-net check skipped: ${err}`);
  }
}
