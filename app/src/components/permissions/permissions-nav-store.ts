import { create } from "zustand";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";

/**
 * A one-shot request to open the Permissions view on a specific agent's
 * settings page, optionally on a specific section.
 *
 * The view owns its own drill-in state, but this deep link arrives from OUTSIDE
 * it: the role-aware blocked-app CTA in the agent workspace (a locked/forbidden
 * app a manager CAN enable) sends the user straight into that agent's settings,
 * on the Apps section where the fix lives. Rather than lift that state into the
 * shared UI store, this tiny colocated store carries the intent: the caller sets
 * the request then calls `openSettings("permissions")` (Permissions is a Settings
 * section since HOU-788, so that ONE store action replaces the old viewMode
 * switch); `PermissionsView` consumes it (initial mount AND while already open)
 * and clears it so a later plain nav lands back on the agent list.
 *
 * The request names any {@link AgentSettingsSection}; a section this host hides
 * falls back within its own rail group (`resolveAgentSettingsSection`).
 *
 * A pin outlives the navigation that set it only if the section never renders,
 * so `SettingsView` clears it (`settings-nav-pins.ts`) whenever a blocked
 * section falls back to the index.
 */
interface PermissionsNavState {
  /** The agent whose settings to open on the next render, or null for none. */
  requestedAgentId: string | null;
  /** The section to open it on (defaults to People when unset). */
  requestedSection: AgentSettingsSection | null;
  /** Ask the view to drill into `agentId`, optionally on a specific section. */
  requestAgentDetail: (agentId: string, section?: AgentSettingsSection) => void;
  /** Drop the pending request once the view has honored it. */
  clearRequested: () => void;
}

export const usePermissionsNav = create<PermissionsNavState>((set) => ({
  requestedAgentId: null,
  requestedSection: null,
  requestAgentDetail: (agentId, section) =>
    set({ requestedAgentId: agentId, requestedSection: section ?? null }),
  clearRequested: () => set({ requestedAgentId: null, requestedSection: null }),
}));
