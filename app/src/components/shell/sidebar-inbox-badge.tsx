import { NeedsYouChip } from "./agent-sidebar-status";
import type { SidebarChromeT } from "./sidebar-chrome";

/**
 * The Inbox row's unread-mention count, or nothing.
 *
 * It is the rail's OWN count badge (`NeedsYouChip`, the one the agent rows
 * wear), not a second badge look invented for the nav: a rail with two shapes
 * for one idea makes the user work out which number is which. The chip is the
 * "act now" weight rather than the quiet unread dot, which is the honest claim
 * — someone typed your name.
 *
 * Nothing at zero. A permanent "0" is a number the eye learns to skip, and the
 * row would then have no way left to say that something arrived.
 */
export function buildInboxBadge(t: SidebarChromeT, mentionCount: number) {
  if (mentionCount <= 0) return undefined;
  return (
    <NeedsYouChip
      count={mentionCount}
      label={t("dashboard:mentions.ariaCount", { count: mentionCount })}
    />
  );
}
