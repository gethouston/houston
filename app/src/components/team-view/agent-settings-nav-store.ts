import { create } from "zustand";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";

/**
 * A one-shot request to open one focused agent's settings, optionally on a
 * specific section. Deep links set the request before opening the focused
 * agent screen; `AgentSettingsPane` consumes and clears it.
 */
interface AgentSettingsNavState {
  requestedAgentId: string | null;
  requestedSection: AgentSettingsSection | null;
  requestAgentDetail: (agentId: string, section?: AgentSettingsSection) => void;
  clearRequested: () => void;
}

export const useAgentSettingsNav = create<AgentSettingsNavState>((set) => ({
  requestedAgentId: null,
  requestedSection: null,
  requestAgentDetail: (agentId, section) =>
    set({ requestedAgentId: agentId, requestedSection: section ?? null }),
  clearRequested: () => set({ requestedAgentId: null, requestedSection: null }),
}));
