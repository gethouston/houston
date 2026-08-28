import {
  AGENTS_HOME_VIEW_ID,
  AI_HUB_VIEW_ID,
  INBOX_VIEW_ID,
  SETTINGS_VIEW_ID,
  TEAM_VIEW_ID,
} from "../../lib/top-level-views";
import { ABOUT_ME_VIEW_ID, AboutMeView } from "../about-me";
import { ACADEMY_VIEW_ID, AcademyView } from "../academy";
import { AgentsHomeView } from "../agents-home/agents-home-view";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { InboxView } from "../inbox/inbox-view";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { ORGANIZATION_VIEW_ID, OrganizationView } from "../organization";
import { SettingsView } from "../settings/settings-view";
import { SKILLS_VIEW_ID, SkillsView } from "../skills-view";
import { STORE_VIEW_ID, StoreView } from "../store-view";
import { TeamView } from "../team-view/team-view";
import type { KeepAliveView } from "./keep-alive-views";

/**
 * The cached top-level screens, separated from the shell's agent-tab chrome.
 *
 * Admin is a screen of its own here, gated so it is never even mounted where it
 * would have nothing to show (`showOrganization`: multiplayer owner/admin, and
 * a TEAM active space on a Spaces host). About me and the Academy are ungated:
 * standing context about the PERSON, and learning the product, exist in every
 * deployment. Settings carries only its own sections now.
 *
 * Two screens that used to be here are gone. Permissions listed the space's
 * agents to reach one's settings page, which every team's "focused agent screen"
 * section already does per team, in every deployment. Time worked is a lens
 * inside Admin.
 *
 * Every team shares the ONE `team` screen for the same reason: it reads the
 * open team and section from the UI store, so the cache survives switching
 * between teams and no view id is ever orphaned by a deleted team.
 */
export function topLevelScreenViews(gates: {
  showAiModels: boolean;
  showOrganization: boolean;
}): KeepAliveView[] {
  return [
    { id: INBOX_VIEW_ID, enabled: true, content: <InboxView /> },
    // The mobile Agents tab's root. Ungated: it is the phone's landing screen,
    // so it must exist before anything else resolves — like the Inbox.
    { id: AGENTS_HOME_VIEW_ID, enabled: true, content: <AgentsHomeView /> },
    { id: ABOUT_ME_VIEW_ID, enabled: true, content: <AboutMeView /> },
    { id: ACADEMY_VIEW_ID, enabled: true, content: <AcademyView /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    {
      id: ORGANIZATION_VIEW_ID,
      enabled: gates.showOrganization,
      content: <OrganizationView />,
    },
    { id: SKILLS_VIEW_ID, enabled: true, content: <SkillsView /> },
    { id: STORE_VIEW_ID, enabled: true, content: <StoreView /> },
    { id: TEAM_VIEW_ID, enabled: true, content: <TeamView /> },
  ];
}
