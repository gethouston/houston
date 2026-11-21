import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listenOsEvent } from "../lib/events";
import { maybeShowMissedPingCallout } from "../lib/notification-nudge";
import { loadNotificationSettings } from "../lib/notification-settings";
import { useUIStore } from "../stores/ui";

export function useNotificationNudges() {
  const addToast = useUIStore((s) => s.addToast);
  const { t } = useTranslation("common");

  useEffect(() => {
    loadNotificationSettings().catch(() => {});

    const check = () => {
      void maybeShowMissedPingCallout({ addToast, t });
    };

    const unlistenActivated = listenOsEvent<unknown>("app-activated", check);
    window.addEventListener("focus", check);
    return () => {
      unlistenActivated();
      window.removeEventListener("focus", check);
    };
  }, [addToast, t]);
}
