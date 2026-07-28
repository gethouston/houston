import {
  AI_HUB_VIEW_ID,
  DASHBOARD_VIEW_ID,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { AiHubView } from "../ai-hub/ai-hub-view";
import { Dashboard } from "../dashboard";
import { INTEGRATIONS_VIEW_ID, IntegrationsView } from "../integrations-view";
import { ORGANIZATION_VIEW_ID, OrganizationView } from "../organization";
import { PERMISSIONS_VIEW_ID, PermissionsView } from "../permissions";
import { SettingsView } from "../settings/settings-view";
import { STORE_VIEW_ID, StoreView } from "../store-view";
import { USAGE_VIEW_ID, UsageView } from "../usage-view";
import type { KeepAliveView } from "./keep-alive-views";

/** The cached top-level screens, separated from the shell's agent-tab chrome. */
export function topLevelScreenViews(gates: {
  showAiModels: boolean;
  showOrganization: boolean;
}): KeepAliveView[] {
  return [
    { id: DASHBOARD_VIEW_ID, enabled: true, content: <Dashboard /> },
    { id: AI_HUB_VIEW_ID, enabled: gates.showAiModels, content: <AiHubView /> },
    { id: USAGE_VIEW_ID, enabled: gates.showAiModels, content: <UsageView /> },
    { id: SETTINGS_VIEW_ID, enabled: true, content: <SettingsView /> },
    {
      id: INTEGRATIONS_VIEW_ID,
      enabled: true,
      content: <IntegrationsView />,
    },
    { id: STORE_VIEW_ID, enabled: true, content: <StoreView /> },
    {
      id: PERMISSIONS_VIEW_ID,
      enabled: gates.showOrganization,
      content: <PermissionsView />,
    },
    {
      id: ORGANIZATION_VIEW_ID,
      enabled: gates.showOrganization,
      content: <OrganizationView />,
    },
  ];
}
