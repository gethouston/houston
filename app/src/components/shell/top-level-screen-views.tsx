import {
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  AI_HUB_VIEW_ID,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { ACADEMY_VIEW_ID, AcademyView } from "../academy";
import { AgentsHomeView } from "../agents-home/agents-home-view";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { ASSISTANT_VIEW_ID, AssistantView } from "../assistant";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { SettingsView } from "../settings/settings-view";
import { SKILLS_VIEW_ID } from "../skills-view/id";
import { SkillsPage } from "../skills-view/skills-page";
import { AgentView } from "../team-view/agent-view";
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
 * Each employee's policy is reached through their own screen; space
 * administration lives under Settings. Employee screens share one view id and
 * read the selected employee and section from the UI store.
 */
export function topLevelScreenViews(gates: {
  showAiModels: boolean;
  showAssistant: boolean;
  showSkills: boolean;
}): KeepAliveView[] {
  return [
    // The phone's Agents tab root and the desktop's temporary boot landing.
    // It also handles an empty roster and dead-view fallbacks.
    { id: AGENTS_HOME_VIEW_ID, enabled: true, content: <AgentsHomeView /> },
    // Gated on DISCOVERY, not on a role: where no assistant exists there is no
    // address to open a chat at, so the screen is never even mounted.
    {
      id: ASSISTANT_VIEW_ID,
      enabled: gates.showAssistant,
      content: <AssistantView />,
    },
    { id: ACADEMY_VIEW_ID, enabled: true, content: <AcademyView /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    { id: SKILLS_VIEW_ID, enabled: gates.showSkills, content: <SkillsPage /> },
    { id: AGENT_VIEW_ID, enabled: true, content: <AgentView /> },
  ];
}
