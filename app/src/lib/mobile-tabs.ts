import {
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  ASSISTANT_VIEW_ID,
} from "./top-level-views.ts";

export type MobileTabId = "agents" | "more";

export function activeMobileTab(ui: { viewMode: string }): MobileTabId {
  if (ui.viewMode === AGENTS_HOME_VIEW_ID || ui.viewMode === AGENT_VIEW_ID)
    return "agents";
  return "more";
}

export function phoneChromeHidden(ui: {
  viewMode: string;
  chatAgentId: string | null;
  missionPanelOpen: boolean;
}): boolean {
  return (
    ui.chatAgentId !== null ||
    ui.missionPanelOpen ||
    ui.viewMode === ASSISTANT_VIEW_ID
  );
}
