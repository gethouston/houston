import {
  ABOUT_ME_VIEW_ID,
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  AI_HUB_VIEW_ID,
  PROFILE_VIEW_ID,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { ACADEMY_VIEW_ID, AcademyView } from "../academy";
import { AboutMeView } from "../account/about-me-view";
import { ProfileView } from "../account/profile-view";
import { AgentsHomeView } from "../agents-home/agents-home-view";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { ASSISTANT_VIEW_ID, AssistantView } from "../assistant";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { OrganizationView } from "../organization";
import { ADMIN_VIEW_ID } from "../organization/id";
import { SettingsView } from "../settings/settings-view";
import { AgentView } from "../team-view/agent-view";
import type { KeepAliveView } from "./keep-alive-views";
import { adminViewEnabled } from "./top-level-screen-plan";

export function topLevelScreenViews(gates: {
  showAiModels: boolean;
  showOrganization: boolean;
  ready: boolean;
}): KeepAliveView[] {
  return [
    { id: AGENTS_HOME_VIEW_ID, enabled: true, content: <AgentsHomeView /> },
    { id: ASSISTANT_VIEW_ID, enabled: true, content: <AssistantView /> },
    { id: ACADEMY_VIEW_ID, enabled: true, content: <AcademyView /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    { id: PROFILE_VIEW_ID, enabled: true, content: <ProfileView /> },
    { id: ABOUT_ME_VIEW_ID, enabled: true, content: <AboutMeView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    {
      id: ADMIN_VIEW_ID,
      enabled: adminViewEnabled(gates),
      content: <OrganizationView />,
    },
    { id: AGENT_VIEW_ID, enabled: true, content: <AgentView /> },
  ];
}
