import { create } from "zustand";
import type { OrgTabId } from "./org-view-model.ts";

/**
 * A one-shot request to open the Organization dashboard on a specific tab.
 *
 * The dashboard owns its own tab state, but the requests arrive from OUTSIDE
 * it — two callers: the C8 team-status banner / trial pill (in the shell)
 * deep-links to Billing, and an agent's hands-on errand card sends the person
 * to Billing. Rather than lift that state into the shared UI store (and couple
 * every consumer to it), this tiny colocated store carries the intent: the
 * caller sets the request, then navigates with `openSettings("workspace")`.
 * `OrganizationView` consumes it and clears it.
 *
 * Settings is KEPT ALIVE, so the dashboard does not remount per navigation: the
 * view consumes the pin from an effect on this field, which fires on the first
 * mount AND while the screen is already open (the same shape
 * `team-view/agent-settings-nav-store.ts` uses). A pin nothing consumes — the
 * gates hide the dashboard, so it is never drawn — cannot mislead either:
 * every caller sits beside the same gates that draw it (the errand card
 * through `lib/hands-on-gates.ts`, which withholds its Open button when
 * Billing is not this person's to open).
 *
 * (Per-agent settings are opened directly by `lib/open-agent.ts`, which routes
 * through the employee's own Settings section rather than pinning anything
 * here.)
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
