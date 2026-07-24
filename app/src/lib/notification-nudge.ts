/**
 * The two contextual notification nudges — the first-mission pre-prompt and the
 * missed-ping catch-net — built on the app's existing toast idiom (visible
 * without hover, auto-dismissing, i18n'd) with a filled CTA that fires the real
 * OS/browser permission request. Both are one-time: the persisted flags in
 * `notification-settings.ts` are set the moment they surface.
 *
 * The decision logic is pure (`notification-permission.ts`); this module wires
 * it to the OS permission runtime and the toast host.
 */

import type { TFunction } from "i18next";
import type { ToastItem } from "../stores/ui";
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
  readOsPermissionGranted,
  requestOsPermission,
} from "./notification-settings";
import { osIsTauri, osOpenNotificationSettings } from "./os-bridge";
import { currentPlatformOs } from "./platform";

type AddToast = (toast: Omit<ToastItem, "id">) => void;

interface NudgeDeps {
  addToast: AddToast;
  /** A `t` bound to (or able to resolve) the `common` namespace. */
  t: TFunction;
}

/** Whether the desktop OS exposes a notification-settings pane we can open. */
function canOpenOsSettings(): boolean {
  return (
    osIsTauri() &&
    (currentPlatformOs === "macos" || currentPlatformOs === "windows")
  );
}

/**
 * The CTA both nudges share: request permission, then confirm or route the user
 * to the settings that unblock delivery. Never swallows a failure (beta policy).
 */
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
    // Denied / dismissed: the OS won't re-prompt, so point the user at the pane
    // that flips it (desktop), or explain where to unblock it (web).
    if (canOpenOsSettings()) {
      addToast({
        title: t("common:notifications.blocked"),
        action: {
          label: t("common:notifications.openSettings"),
          onClick: () => {
            osOpenNotificationSettings().catch((err) => {
              addToast({
                title: t("common:notifications.openSettingsFailed", {
                  error: String(err),
                }),
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
    addToast({
      title: t("common:notifications.requestFailed", { error: String(err) }),
      variant: "error",
    });
  }
}

/**
 * Surface the first-mission pre-prompt if delivery isn't granted and we've never
 * asked. Marks the asked flag on show so it's strictly one-time. Fire-and-forget
 * from the mission send path.
 */
export async function maybeShowFirstMissionPrompt(
  deps: NudgeDeps,
): Promise<void> {
  // Guarded: this is fire-and-forget from the send path and its prefs reads can
  // reject (the engine already surfaces such a failure via `call()`), so we must
  // not leave an unhandled rejection. A failed read just means no nudge.
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

/**
 * Surface the missed-ping catch-net if a completion notification was missed,
 * the user hasn't seen this callout, and delivery still isn't granted. Marks the
 * dismissed flag on show so it's strictly one-time. Fire-and-forget on app focus.
 */
export async function maybeShowMissedPingCallout(
  deps: NudgeDeps,
): Promise<void> {
  // Guarded like the pre-prompt above: fire-and-forget on focus, prefs reads can
  // reject, so never leave an unhandled rejection.
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
