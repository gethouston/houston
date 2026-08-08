import type { SettingsSectionId } from "../../lib/settings-sections.ts";
import { useOrgNav } from "../organization/org-nav-store.ts";

/**
 * Drop the ONE-SHOT deep-link pin belonging to `section`.
 *
 * One surface pins an intent right before opening a Settings section: the
 * team-status banner pins a tab for Admin (`useOrgNav`). The section itself
 * consumes and clears its pin on render — but when `SettingsView` falls a
 * BLOCKED section back to the index, that section never renders, so the pin
 * would survive for the whole session and hijack the next legitimate open
 * (landing on a stale tab). Clearing it here keeps a pin's life exactly as
 * long as the navigation that set it.
 *
 * Store writes only, no React, so the rule stays node-testable.
 */
export function clearSettingsSectionPin(section: SettingsSectionId): void {
  if (section === "organization") useOrgNav.getState().clearRequestedTab();
}
