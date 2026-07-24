import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listenOsEvent } from "../lib/events";
import { maybeShowMissedPingCallout } from "../lib/notification-nudge";
import { loadNotificationSettings } from "../lib/notification-settings";
import { useUIStore } from "../stores/ui";

/**
 * Owns the app-lifecycle side of notification onboarding:
 *  1. hydrates the in-app toggle cache at startup (so the send chokepoint gate
 *     reads a coherent value), and
 *  2. surfaces the missed-ping catch-net on the next app foregrounding.
 *
 * The first-mission pre-prompt is triggered from the mission send path itself
 * (`useAgentBoardSend`), not here. Both callouts are one-time — their persisted
 * flags gate re-showing — so firing on every focus signal is safe.
 */
export function useNotificationNudges() {
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useTranslation("common");

  useEffect(() => {
    loadNotificationSettings().catch(() => {
      // A failed hydrate leaves the cache at its ON default (features default
      // ON): the gate stays open, so there is nothing to surface to the user.
    });

    const check = () => {
      void maybeShowMissedPingCallout({ addToast, t });
    };

    // Desktop foregrounding (dock click, alt-tab, resume) arrives as
    // `app-activated`; web tab focus arrives as the DOM focus event. Both are
    // idempotent through the one-time flag.
    const unlistenActivated = listenOsEvent<unknown>("app-activated", check);
    window.addEventListener("focus", check);
    return () => {
      unlistenActivated();
      window.removeEventListener("focus", check);
    };
  }, [addToast, t]);
}
