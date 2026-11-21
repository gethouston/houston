import { create } from "zustand";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";

interface AgentSettingsNavState {
  requestedAgentId: string | null;
  requestedSection: AgentSettingsSection | null;
  requestAgentDetail: (agentId: string, section?: AgentSettingsSection) => void;
  clearRequested: () => void;
  shown: { agentId: string; section: AgentSettingsSection } | null;
  setShown: (
    shown: { agentId: string; section: AgentSettingsSection } | null,
  ) => void;
  apiAccessFor: string | null;
  setApiAccessFor: (agentId: string | null) => void;
}

export const useAgentSettingsNav = create<AgentSettingsNavState>((set) => ({
  requestedAgentId: null,
  requestedSection: null,
  requestAgentDetail: (agentId, section) =>
    set({ requestedAgentId: agentId, requestedSection: section ?? null }),
  clearRequested: () => set({ requestedAgentId: null, requestedSection: null }),
  shown: null,
  setShown: (shown) => set({ shown }),
  apiAccessFor: null,
  setApiAccessFor: (apiAccessFor) => set({ apiAccessFor }),
}));
