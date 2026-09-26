/**
 * Full-window destinations share one view registry. The employee screen has
 * one view id; its selected employee and section live in store state. Folder
 * headers have no view id because they only change SidebarLayout disclosure.
 * A stale view falls back to AI Employees home.
 */
import { ACADEMY_VIEW_ID } from "../components/academy/id.ts";
import { AGENTS_HOME_VIEW_ID } from "../components/agents-home/id.ts";
import { ASSISTANT_VIEW_ID } from "../components/assistant/id.ts";
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../components/skills-view/id.ts";
import { AGENT_VIEW_ID, type TeamSectionId } from "./teams-model.ts";

export {
  ACADEMY_VIEW_ID,
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  ASSISTANT_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  SKILLS_VIEW_ID,
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
  | typeof SKILLS_VIEW_ID
  | typeof AGENT_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  ASSISTANT_VIEW_ID,
  ACADEMY_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  SKILLS_VIEW_ID,
  AGENT_VIEW_ID,
]);

/** Whether a `viewMode` names one of the app's screens. */
export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode as TopLevelViewId);
}

/** The employee view can host a board, depending on its open section. */
export function isMissionBoardView(viewMode: string): boolean {
  return viewMode === AGENT_VIEW_ID;
}

/**
 * Board shortcuts belong only to the open Tasks section. A null section
 * resolves to Tasks; other sections must leave keyboard events alone.
 */
export function isMissionBoardSurface(ui: {
  viewMode: string;
  agentSection: TeamSectionId | null;
}): boolean {
  if (ui.viewMode !== AGENT_VIEW_ID) return false;
  return ui.agentSection === null || ui.agentSection === "mission-control";
}

/** Whether a kept-alive top-level surface is the one currently on screen. */
export function isActiveTopLevelView(
  activeViewMode: string,
  viewId: TopLevelViewId,
): boolean {
  return activeViewMode === viewId;
}

/**
 * Whether a top-level `viewMode` points at a view whose gate is off for this
 * caller: the AI Models hub hides from plain members, the shared Skills library
 * belongs to whoever owns the space, and the assistant exists only where
 * discovery hands out an address. The sidebar entry is already hidden,
 * so a STALE `viewMode` (the role changed on a space switch, or the install
 * moved off the hosted cloud, while the page was open) would otherwise fall
 * through every render branch and strand the user on the shell's engine pane
 * with no way back; the workspace shell sends a blocked view home. Pure so the
 * fallback rule is unit-tested.
 *
 * Callers must only act on this once the gates have RESOLVED (`ready` in
 * `useSurfaceGates`): capabilities are null while they load and every gate reads
 * false then, so deciding early would bounce a legitimate view on every space
 * switch — the exact window a team-space switch opens, since it drops the
 * capabilities query.
 */
export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showAiModels: boolean;
    showAssistant: boolean;
    showSkills: boolean;
  },
): boolean {
  if (viewMode === AI_HUB_VIEW_ID) return !gates.showAiModels;
  if (viewMode === ASSISTANT_VIEW_ID) return !gates.showAssistant;
  if (viewMode === SKILLS_VIEW_ID) return !gates.showSkills;
  return false;
}
