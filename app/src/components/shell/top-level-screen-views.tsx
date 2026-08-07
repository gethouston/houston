import {
  AI_HUB_VIEW_ID,
  DASHBOARD_VIEW_ID,
  SETTINGS_VIEW_ID,
  TEAM_VIEW_ID,
} from "../../lib/top-level-views";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { Dashboard } from "../dashboard";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { SettingsView } from "../settings/settings-view";
import { SKILLS_VIEW_ID, SkillsView } from "../skills-view";
import { STORE_VIEW_ID, StoreView } from "../store-view";
import { TeamView } from "../team-view/team-view";
import type { KeepAliveView } from "./keep-alive-views";

/**
 * The cached top-level screens, separated from the shell's agent-tab chrome.
 *
 * Usage, Permissions and Admin are not here: since HOU-788 they are drill-in
 * sections of Settings, so the kept-alive Settings screen carries their state
 * (including which section is open) the same way it carries its own.
 *
 * Every team shares the ONE `team` screen for the same reason: it reads the
 * open team and section from the UI store, so the cache survives switching
 * between teams and no view id is ever orphaned by a deleted team.
 */
export function topLevelScreenViews(gates: {
  showAiModels: boolean;
}): KeepAliveView[] {
  return [
    { id: DASHBOARD_VIEW_ID, enabled: true, content: <Dashboard /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    { id: SKILLS_VIEW_ID, enabled: true, content: <SkillsView /> },
    { id: STORE_VIEW_ID, enabled: true, content: <StoreView /> },
    { id: TEAM_VIEW_ID, enabled: true, content: <TeamView /> },
  ];
}
