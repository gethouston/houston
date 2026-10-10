import i18n from "../lib/i18n";
import { logger } from "../lib/logger";
import { sendSessionNotification } from "./session-notifications";

/**
 * The OS ping for the AI Manager's morning briefing, on the host's
 * `HeartbeatDelivered` event. Clicking it opens the manager's chat. A quiet
 * or failed morning sends no event, so it never pings. The in-app
 * notifications toggle still governs it (`sendSessionNotification`'s gate).
 */
export function notifyMorningBriefing(): void {
  sendSessionNotification(
    i18n.t("common:notifications.morningBriefing.title"),
    i18n.t("common:notifications.morningBriefing.body"),
    { assistant: true },
  ).catch((e) => {
    logger.error(`[notification] morning briefing notification failed: ${e}`);
  });
}
