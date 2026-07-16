import { create } from "zustand";

/** Which tab of an agent's Permissions detail a deep link should open on. */
export type PermissionsAgentTab = "people" | "integrations" | "models";

/**
 * A one-shot request to open the Permissions view on a specific agent's detail,
 * optionally on a specific tab.
 *
 * The view owns its own drill-in state, but this deep link arrives from OUTSIDE
 * it: the role-aware blocked-app CTA in the agent workspace (a locked/forbidden
 * app a manager CAN enable) sends the user straight into that agent's detail, on
 * the Integrations tab where the fix lives. Rather than lift that state into the
 * shared UI store, this tiny colocated store carries the intent: the caller sets
 * the request then switches `viewMode` to the Permissions view; `PermissionsView`
 * consumes it (initial mount AND while already open) and clears it so a later
 * plain nav lands back on the agent list.
 */
interface PermissionsNavState {
  /** The agent whose detail to open on the next render, or null for none. */
  requestedAgentId: string | null;
  /** The tab to open that detail on (defaults to People when unset). */
  requestedAgentTab: PermissionsAgentTab | null;
  /** Ask the view to drill into `agentId`, optionally on a specific tab. */
  requestAgentDetail: (agentId: string, tab?: PermissionsAgentTab) => void;
  /** Drop the pending request once the view has honored it. */
  clearRequested: () => void;
}

export const usePermissionsNav = create<PermissionsNavState>((set) => ({
  requestedAgentId: null,
  requestedAgentTab: null,
  requestAgentDetail: (agentId, tab) =>
    set({ requestedAgentId: agentId, requestedAgentTab: tab ?? null }),
  clearRequested: () =>
    set({ requestedAgentId: null, requestedAgentTab: null }),
}));
