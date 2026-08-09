import { create } from "zustand";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";

/**
 * A one-shot request to open Team Settings already drilled into ONE agent's
 * settings page, optionally on a specific section.
 *
 * `TeamSettings` owns its drill-in as local state, but these deep links arrive
 * from OUTSIDE the team view — a turn summary's "the agent updated its job
 * description" link, an "open this agent's settings" affordance. Lifting the
 * drill-in into the shared UI store would make every team surface re-render on
 * a navigation only one of them cares about, so the intent travels in this tiny
 * colocated store instead: the caller sets the request and calls
 * `openTeamView(teamId, "settings")`; `TeamSettings` consumes it (on first
 * mount AND while already open) and clears it, so a later plain click on the
 * Settings row lands back on the team's agent list.
 *
 * The requested section names any {@link AgentSettingsSection}; one this host
 * hides falls back within its own rail group (`resolveAgentSettingsSection`),
 * exactly as the Permissions deep link does.
 *
 * Mirrors `components/permissions/permissions-nav-store.ts`, deliberately as a
 * SECOND store rather than a shared one: the two views own separate drill-in
 * state, and a single pin would have one view swallow the other's request.
 */
interface TeamSettingsNavState {
  /** The agent whose settings to open on the next render, or null for none. */
  requestedAgentId: string | null;
  /** The section to open it on (the page's own default when unset). */
  requestedSection: AgentSettingsSection | null;
  /** Ask Team Settings to drill into `agentId`, optionally on a section. */
  requestAgentDetail: (agentId: string, section?: AgentSettingsSection) => void;
  /** Drop the pending request once the view has honored it. */
  clearRequested: () => void;
}

export const useTeamSettingsNav = create<TeamSettingsNavState>((set) => ({
  requestedAgentId: null,
  requestedSection: null,
  requestAgentDetail: (agentId, section) =>
    set({ requestedAgentId: agentId, requestedSection: section ?? null }),
  clearRequested: () => set({ requestedAgentId: null, requestedSection: null }),
}));
