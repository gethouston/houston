import { create } from "zustand";

/** Which tab of the Permissions view a deep link targets. */
export type PermissionsTab = "people" | "agents";

/**
 * A one-shot request to open the Permissions view on a specific tab, or on a
 * specific agent's per-agent detail (inside the Agents tab).
 *
 * The view owns its own tab + drill-in state, but deep links arrive from OUTSIDE
 * it: the role-aware blocked-app CTA in the agent workspace (a locked/forbidden
 * app a manager CAN enable) sends the user straight into that agent's per-agent
 * card. Rather than lift that state into the shared UI store, this tiny colocated
 * store carries the intent: the caller sets the request then switches `viewMode`
 * to the Permissions view; `PermissionsView` consumes it (initial mount AND while
 * already open) and clears it so a later plain nav lands on the default tab.
 */
interface PermissionsNavState {
  /** The tab to open on the next render, or null for the default (People). */
  requestedTab: PermissionsTab | null;
  /**
   * The agent whose per-agent detail to open on the next render (implies the
   * Agents tab), or null for none. Consumed alongside `requestedTab`.
   */
  requestedAgentId: string | null;
  /** Ask the view to drill into `agentId` (implies the Agents tab). */
  requestAgentDetail: (agentId: string) => void;
  /** Drop the pending request(s) once the view has honored them. */
  clearRequested: () => void;
}

export const usePermissionsNav = create<PermissionsNavState>((set) => ({
  requestedTab: null,
  requestedAgentId: null,
  requestAgentDetail: (agentId) =>
    set({ requestedTab: "agents", requestedAgentId: agentId }),
  clearRequested: () => set({ requestedTab: null, requestedAgentId: null }),
}));
