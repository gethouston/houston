import type { SettingsSectionId } from "./settings-sections";
import type { TeamSectionId } from "./teams-model.ts";
import { AGENTS_HOME_VIEW_ID } from "./top-level-views.ts";

export interface NavEntry {
  viewMode: string;
  settingsSection: SettingsSectionId | null;
  activeAgentId: string | null;
  agentSection: TeamSectionId | null;
  agentsHomeAgentId: string | null;
  chatAgentId: string | null;
  chatMissionId: string | null;
  panelOpen: boolean;
  previewOpen: boolean;
}

export interface NavState {
  navStack: NavEntry[];
  navIndex: number;
}

export function canNavigateBack(state: NavState): boolean {
  return state.navIndex > 0;
}

export type NavMode = "push" | "replace" | "retreat" | "reset";

export interface NavSourceFields {
  viewMode: string;
  settingsSection: SettingsSectionId | null;
  activeAgentId: string | null;
  agentSection: TeamSectionId | null;
  agentsHomeAgentId: string | null;
  chatAgentId: string | null;
  chatMissionId: string | null;
  missionPanelOpen: boolean;
  filePreview: object | null;
}

export function navEntryOf(s: NavSourceFields): NavEntry {
  return {
    viewMode: s.viewMode,
    settingsSection: s.settingsSection,
    activeAgentId: s.activeAgentId,
    agentSection: s.agentSection,
    agentsHomeAgentId: s.agentsHomeAgentId,
    chatAgentId: s.chatAgentId,
    chatMissionId: s.chatMissionId,
    panelOpen: s.missionPanelOpen,
    previewOpen: s.filePreview !== null,
  };
}

export function sameNavEntry(a: NavEntry, b: NavEntry): boolean {
  return (
    a.viewMode === b.viewMode &&
    a.settingsSection === b.settingsSection &&
    a.activeAgentId === b.activeAgentId &&
    a.agentSection === b.agentSection &&
    a.agentsHomeAgentId === b.agentsHomeAgentId &&
    a.chatAgentId === b.chatAgentId &&
    a.chatMissionId === b.chatMissionId &&
    a.panelOpen === b.panelOpen &&
    a.previewOpen === b.previewOpen
  );
}

export function viewFieldsOf(
  entry: NavEntry,
): Omit<NavEntry, "panelOpen" | "previewOpen"> {
  const { panelOpen: _panelOpen, previewOpen: _previewOpen, ...fields } = entry;
  return fields;
}

export function initialNavState(): NavState {
  return {
    navStack: [
      navEntryOf({
        viewMode: AGENTS_HOME_VIEW_ID,
        settingsSection: null,
        activeAgentId: null,
        agentSection: null,
        agentsHomeAgentId: null,
        chatAgentId: null,
        chatMissionId: null,
        missionPanelOpen: false,
        filePreview: null,
      }),
    ],
    navIndex: 0,
  };
}

export function navigated<P extends object>(
  s: NavSourceFields & NavState,
  partial: P,
  mode: NavMode,
): P | (P & NavState) {
  const resulting = navEntryOf({ ...s, ...partial });
  const current = s.navStack[s.navIndex];
  if (mode === "reset") {
    if (s.navStack.length === 1 && sameNavEntry(resulting, current))
      return partial;
    return { ...partial, navStack: [resulting], navIndex: 0 };
  }
  if (sameNavEntry(resulting, current)) return partial;
  if (mode === "push") {
    return {
      ...partial,
      navStack: [...s.navStack.slice(0, s.navIndex + 1), resulting],
      navIndex: s.navIndex + 1,
    };
  }
  if (mode === "retreat") {
    const previous = s.navIndex > 0 ? s.navStack[s.navIndex - 1] : null;
    if (previous !== null && sameNavEntry(previous, resulting)) {
      return { ...partial, navStack: s.navStack, navIndex: s.navIndex - 1 };
    }
  }
  const navStack = s.navStack.slice();
  navStack[s.navIndex] = resulting;
  return { ...partial, navStack, navIndex: s.navIndex };
}
