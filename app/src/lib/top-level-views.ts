import { ACADEMY_VIEW_ID } from "../components/academy/id.ts";
import { ABOUT_ME_VIEW_ID, PROFILE_VIEW_ID } from "../components/account/id.ts";
import { AGENTS_HOME_VIEW_ID } from "../components/agents-home/id.ts";
import { ASSISTANT_VIEW_ID } from "../components/assistant/id.ts";
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { ADMIN_VIEW_ID } from "../components/organization/id.ts";
import { AGENT_VIEW_ID, type TeamSectionId } from "./teams-model.ts";

export {
  ABOUT_ME_VIEW_ID,
  ACADEMY_VIEW_ID,
  ADMIN_VIEW_ID,
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  ASSISTANT_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  PROFILE_VIEW_ID,
};

export const SETTINGS_VIEW_ID = "settings";
export const AI_HUB_VIEW_ID = "ai-hub";

export type TopLevelViewId =
  | typeof ASSISTANT_VIEW_ID
  | typeof ACADEMY_VIEW_ID
  | typeof AGENTS_HOME_VIEW_ID
  | typeof SETTINGS_VIEW_ID
  | typeof AI_HUB_VIEW_ID
  | typeof INTEGRATIONS_VIEW_ID
  | typeof ADMIN_VIEW_ID
  | typeof PROFILE_VIEW_ID
  | typeof ABOUT_ME_VIEW_ID
  | typeof AGENT_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  ASSISTANT_VIEW_ID,
  ACADEMY_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  ADMIN_VIEW_ID,
  PROFILE_VIEW_ID,
  ABOUT_ME_VIEW_ID,
  AGENT_VIEW_ID,
]);

export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode as TopLevelViewId);
}

export function isMissionBoardView(viewMode: string): boolean {
  return viewMode === AGENT_VIEW_ID;
}

export function isMissionBoardSurface(ui: {
  viewMode: string;
  agentSection: TeamSectionId | null;
}): boolean {
  if (ui.viewMode !== AGENT_VIEW_ID) return false;
  return ui.agentSection === null || ui.agentSection === "mission-control";
}

export function isActiveTopLevelView(
  activeViewMode: string,
  viewId: TopLevelViewId,
): boolean {
  return activeViewMode === viewId;
}

export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showAiModels: boolean;
    showAssistant: boolean;
    showOrganization: boolean;
  },
): boolean {
  if (viewMode === AI_HUB_VIEW_ID) return !gates.showAiModels;
  if (viewMode === ASSISTANT_VIEW_ID) return !gates.showAssistant;
  if (viewMode === ADMIN_VIEW_ID) return !gates.showOrganization;
  return false;
}
