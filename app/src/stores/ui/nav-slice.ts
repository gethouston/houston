import { navigated, viewFieldsOf } from "../../lib/nav-stack.ts";
import { AGENT_VIEW_ID } from "../../lib/teams-model.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";
import type { NavActions } from "./nav-state.ts";
import type { UISliceCreator } from "./state.ts";

/** Every navigation that is not the chat itself closes the pushed chat: the
 *  chat renders over ANY view, so a stale pair would keep it glued over the
 *  next screen. Spread into each nav-aware action's write. */
export const noChat = { chatAgentId: null, chatMissionId: null };

export const createNavActions: UISliceCreator<NavActions> = (set, get) => ({
  navBack: () => get().navApplyHistory(get().navIndex - 1),
  navApplyHistory: (index) => {
    const s = get();
    const clamped = Math.max(0, Math.min(index, s.navStack.length - 1));
    if (clamped === s.navIndex) return;
    const entry = s.navStack[clamped];
    set({ navIndex: clamped, ...viewFieldsOf(entry) });
    // The panel closes through its OWNER (deselect and all), outside the
    // write above: the closer's own store writes then find the stack
    // already at the panel-less entry, so they fold in as no-ops instead
    // of double-popping. An entry WITH a panel can't reopen it — the
    // selection it derived from is gone (see NavEntry.panelOpen).
    if (!entry.panelOpen && get().missionPanelOpen) {
      const close = get().onPanelClose;
      if (close) close();
      else get().closeMissionPanel();
    }
  },
  setViewMode: (viewMode, opts) =>
    set((s) => navigated(s, { viewMode, ...noChat }, opts?.nav ?? "push")),
  openAgentView: (activeAgentId, agentSection, opts) =>
    set((s) =>
      navigated(
        s,
        { viewMode: AGENT_VIEW_ID, activeAgentId, agentSection, ...noChat },
        opts?.nav ?? "push",
      ),
    ),
  // Drilling INTO a section is a new place; back to the index is a
  // "back" (pops when the index is where the user came from).
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
        { viewMode: "settings", settingsSection, ...noChat },
        opts?.nav ?? "push",
      ),
    ),
  openAgentsHome: (agentsHomeAgentId, opts) =>
    set((s) =>
      navigated(
        s,
        { viewMode: AGENTS_HOME_VIEW_ID, agentsHomeAgentId, ...noChat },
        opts?.nav ?? "push",
      ),
    ),
  setAgentsHomeTeamId: (agentsHomeTeamId) => set({ agentsHomeTeamId }),
  openMissionChat: (chatAgentId, chatMissionId, opts) =>
    set((s) =>
      navigated(s, { chatAgentId, chatMissionId }, opts?.nav ?? "push"),
    ),
  closeMissionChat: () => set((s) => navigated(s, { ...noChat }, "retreat")),
});
