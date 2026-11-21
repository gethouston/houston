import { navigated, viewFieldsOf } from "../../lib/nav-stack.ts";
import { AGENT_VIEW_ID } from "../../lib/teams-model.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";
import type { NavActions } from "./nav-state.ts";
import type { UISliceCreator } from "./state.ts";

export const noChat = { chatAgentId: null, chatMissionId: null };

export const noPreview = { filePreview: null };

export const createNavActions: UISliceCreator<NavActions> = (set, get) => ({
  navBack: () => get().navApplyHistory(get().navIndex - 1),
  navApplyHistory: (index) => {
    const s = get();
    const clamped = Math.max(0, Math.min(index, s.navStack.length - 1));
    if (clamped === s.navIndex) return;
    const entry = s.navStack[clamped];
    set({ navIndex: clamped, ...viewFieldsOf(entry) });
    if (!entry.previewOpen && get().filePreview) set({ filePreview: null });
    if (!entry.panelOpen && get().missionPanelOpen) {
      const close = get().onPanelClose;
      if (close) close();
      else get().closeMissionPanel();
    }
  },
  setViewMode: (viewMode, opts) =>
    set((s) =>
      navigated(s, { viewMode, ...noChat, ...noPreview }, opts?.nav ?? "push"),
    ),
  openAgentView: (activeAgentId, agentSection, opts) =>
    set((s) =>
      navigated(
        s,
        {
          viewMode: AGENT_VIEW_ID,
          activeAgentId,
          agentSection,
          ...noChat,
          ...noPreview,
        },
        opts?.nav ?? "push",
      ),
    ),
  setSettingsSection: (settingsSection) =>
    set((s) =>
      navigated(
        s,
        { settingsSection },
        settingsSection === null ? "retreat" : "push",
      ),
    ),
  openSettings: (settingsSection, opts) =>
    set((s) =>
      navigated(
        s,
        { viewMode: "settings", settingsSection, ...noChat, ...noPreview },
        opts?.nav ?? "push",
      ),
    ),
  openAgentsHome: (agentsHomeAgentId, opts) =>
    set((s) =>
      navigated(
        s,
        {
          viewMode: AGENTS_HOME_VIEW_ID,
          agentsHomeAgentId,
          ...noChat,
          ...noPreview,
        },
        opts?.nav ?? "push",
      ),
    ),
  setAgentsHomeTeamId: (agentsHomeTeamId) => set({ agentsHomeTeamId }),
  openMissionChat: (chatAgentId, chatMissionId, opts) =>
    set((s) =>
      navigated(
        s,
        { chatAgentId, chatMissionId, ...noPreview },
        opts?.nav ?? "push",
      ),
    ),
  closeMissionChat: () =>
    set((s) => navigated(s, { ...noChat, ...noPreview }, "retreat")),
});
