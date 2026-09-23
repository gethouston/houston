import {
  AGENTS_HOME_VIEW_ID,
  AI_HUB_VIEW_ID,
  SETTINGS_VIEW_ID,
  TEAM_VIEW_ID,
} from "../../lib/top-level-views";
import { ACADEMY_VIEW_ID, AcademyView } from "../academy";
import { AgentsHomeView } from "../agents-home/agents-home-view";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { ASSISTANT_VIEW_ID, AssistantView } from "../assistant";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { SettingsView } from "../settings/settings-view";
import { SKILLS_VIEW_ID } from "../skills-view/id";
import { SkillsPage } from "../skills-view/skills-page";
import { TeamView } from "../team-view/team-view";
import { TEAMS_HOME_VIEW_ID } from "../teams-home/id";
import { TeamsHomeView } from "../teams-home/teams-home-view";
import type { KeepAliveView } from "./keep-alive-views";

/**
 * The cached top-level screens, separated from the shell's agent-tab chrome.
 *
 * The Academy is ungated: learning the product exists in every deployment.
 * Settings carries its own sections — About me and Workspace management, which
 * holds everything that administers the space (`lib/settings-sections.ts`).
 *
 * The shared Skills library is its own screen, gated like the rail row that
 * opens it: a skill edit reaches every agent in the space, so the surface
 * belongs to whoever owns it.
 *
 * Agent policy is reached through each team's focused agent screen, and the
 * space's own administration through Settings, so neither owns a screen here.
 *
 * Every team shares the ONE `team` screen: it reads the
 * open team and section from the UI store, so the cache survives switching
 * between teams and no view id is ever orphaned by a deleted team.
 */
export function topLevelScreenViews(gates: {
  showAiModels: boolean;
  showAssistant: boolean;
  showSkills: boolean;
}): KeepAliveView[] {
  return [
    // The app's landing screen, and the Agents tab's root on the phone.
    // Ungated: boot waits here and every fallback lands here while no team has
    // resolved, so it must exist before anything else does.
    { id: AGENTS_HOME_VIEW_ID, enabled: true, content: <AgentsHomeView /> },
    // Gated on DISCOVERY, not on a role: where no assistant exists there is no
    // address to open a chat at, so the screen is never even mounted.
    {
      id: ASSISTANT_VIEW_ID,
      enabled: gates.showAssistant,
      content: <AssistantView />,
    },
    // The mobile Teams tab's root, ungated for the same reason.
    { id: TEAMS_HOME_VIEW_ID, enabled: true, content: <TeamsHomeView /> },
    { id: ACADEMY_VIEW_ID, enabled: true, content: <AcademyView /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    { id: SKILLS_VIEW_ID, enabled: gates.showSkills, content: <SkillsPage /> },
    { id: TEAM_VIEW_ID, enabled: true, content: <TeamView /> },
  ];
}
