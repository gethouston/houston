import type { PermissionsFix } from "../../integrations";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import type { AgentIntegrationsView } from "./model";

interface AgentCatalogSectionsProps {
  view: AgentIntegrationsView;
  /** Role-aware "Enable it in Permissions" resolver for the disallowed apps;
   *  absent = the member view (ask-your-admin copy). */
  permissionsFix?: PermissionsFix;
}

/**
 * The agent-only sections that hang below the shared browse catalog (rendered
 * as the {@link CatalogPane}'s children): the read-only admin-blocked apps
 * (transparency + a single role-aware pointer into Permissions). Renders only
 * when there are disallowed rows. Extracted from the body to keep it under the
 * file-size ceiling.
 */
export function AgentCatalogSections({
  view,
  permissionsFix,
}: AgentCatalogSectionsProps) {
  if (view.disallowedRows.length === 0) return null;
  return (
    <AgentDisallowedAppsSection
      rows={view.disallowedRows}
      onEnable={permissionsFix}
    />
  );
}
