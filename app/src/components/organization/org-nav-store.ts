import { create } from "zustand";
import type { OrgTabId } from "./org-view-model.ts";

/**
 * A one-shot request to open the Organization dashboard on a specific tab.
 *
 * The dashboard owns its own tab state, but the deep link arrives from OUTSIDE
 * it: the C8 team-status banner / trial pill (in the shell) sends the user to
 * the Billing tab. Rather than lift that state into the shared UI store (and
 * couple every consumer to it), this tiny colocated store carries the intent:
 * the caller sets the request, then navigates with
 * `setViewMode(ORGANIZATION_VIEW_ID)`. `OrganizationView` consumes it and clears
 * it, so a later plain nav to the dashboard lands on the default tab.
 *
 * Admin is a KEPT-ALIVE top-level screen, so it does not remount per
 * navigation: the view consumes the pin from an effect on this field, which
 * fires on the first mount AND while the screen is already open (the same shape
 * `team-view/team-settings-nav-store.ts` uses). A pin nothing consumes — the
 * gates hide Admin, so the screen is never mounted — cannot mislead either: the
 * caller that sets it is itself behind the team-space gate.
 *
 * (Per-agent settings are opened directly by `lib/open-agent.ts`, which routes
 * through Team Settings rather than pinning anything here.)
 */
interface OrgNavState {
  /** The tab to open on the next Organization render, or null for the default. */
  requestedTab: OrgTabId | null;
  /** Ask the dashboard to open `tab` (consumed + cleared by the view). */
  requestTab: (tab: OrgTabId) => void;
  /** Drop the pending request once the view has honored it. */
  clearRequestedTab: () => void;
}

export const useOrgNav = create<OrgNavState>((set) => ({
  requestedTab: null,
  requestTab: (tab) => set({ requestedTab: tab }),
  clearRequestedTab: () => set({ requestedTab: null }),
}));
