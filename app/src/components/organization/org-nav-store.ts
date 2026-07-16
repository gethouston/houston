import { create } from "zustand";
import type { OrgTabId } from "./org-view-model.ts";

/**
 * A one-shot request to open the Organization dashboard on a specific tab, or on
 * a specific agent's fleet drill-in.
 *
 * The dashboard owns its own tab + drill-in state, but deep links arrive from
 * OUTSIDE it: the C8 team-status banner/trial pill (in the shell) sends the user
 * to the Billing tab; the role-aware blocked-state CTAs in the agent workspace
 * (a locked/forbidden app a manager CAN enable) send the user to this agent's
 * drill-in. Rather than lift that state into the shared UI store (and couple
 * every consumer to it), this tiny colocated store carries the intent: the
 * caller sets the request then switches `viewMode` to the org view;
 * `OrganizationView` consumes it (initial mount AND while already open) and
 * clears it so a later plain nav to the dashboard lands on the default tab.
 */
interface OrgNavState {
  /** The tab to open on the next Organization render, or null for the default. */
  requestedTab: OrgTabId | null;
  /**
   * The agent whose fleet drill-in to open on the next Organization render (with
   * `requestedTab === "agents"`), or null for none. Consumed alongside
   * `requestedTab`; a host that only honors the tab lands on the Agents grid.
   */
  requestedAgentId: string | null;
  /** Ask the dashboard to open `tab` (consumed + cleared by the view). */
  requestTab: (tab: OrgTabId) => void;
  /** Ask the dashboard to drill into `agentId` (implies the Agents tab). */
  requestAgentDetail: (agentId: string) => void;
  /** Drop the pending request(s) once the view has honored them. */
  clearRequestedTab: () => void;
}

export const useOrgNav = create<OrgNavState>((set) => ({
  requestedTab: null,
  requestedAgentId: null,
  requestTab: (tab) => set({ requestedTab: tab }),
  requestAgentDetail: (agentId) =>
    set({ requestedTab: "agents", requestedAgentId: agentId }),
  clearRequestedTab: () => set({ requestedTab: null, requestedAgentId: null }),
}));
