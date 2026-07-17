import { create } from "zustand";
import type { OrgTabId } from "./org-view-model.ts";

/**
 * A one-shot request to open the Organization dashboard on a specific tab.
 *
 * The dashboard owns its own tab state, but the deep link arrives from OUTSIDE
 * it: the C8 team-status banner / trial pill (in the shell) sends the user to
 * the Billing tab. Rather than lift that state into the shared UI store (and
 * couple every consumer to it), this tiny colocated store carries the intent:
 * the caller sets the request then switches `viewMode` to the org view;
 * `OrganizationView` consumes it (initial mount AND while already open) and
 * clears it so a later plain nav to the dashboard lands on the default tab.
 *
 * (Per-agent / permission deep links now target the top-level Permissions view
 * via `usePermissionsNav`, not this store.)
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
