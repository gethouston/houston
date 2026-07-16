import type { IntegrationToolkit } from "@houston-ai/engine-client";
import type { PermissionsFix } from "../../integrations";
import { AgentApprovedActionsSection } from "./agent-approved-actions-section";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import type { AgentIntegrationsView } from "./model";

interface AgentCatalogSectionsProps {
  view: AgentIntegrationsView;
  agentId: string;
  /** The toolkit catalog, so the approved-actions review can resolve app identity. */
  catalog: IntegrationToolkit[];
  /** Role-aware "Enable it in Permissions" resolver for the disallowed apps;
   *  absent = the member view (ask-your-admin copy). */
  permissionsFix?: PermissionsFix;
}

/**
 * The agent-only sections that hang below the shared browse catalog (rendered
 * as the {@link CatalogPane}'s children): the read-only admin-blocked apps
 * (transparency + a single role-aware pointer into Permissions), then the
 * "Runs without asking" review of always-allowed actions. Each renders only
 * when it has rows — the approved-actions section self-gates on its own query,
 * so it shows whenever the agent has blessed an action. Extracted from the body
 * to keep it under the file-size ceiling.
 */
export function AgentCatalogSections({
  view,
  agentId,
  catalog,
  permissionsFix,
}: AgentCatalogSectionsProps) {
  return (
    <>
      {view.disallowedRows.length > 0 && (
        <AgentDisallowedAppsSection
          rows={view.disallowedRows}
          onEnable={permissionsFix}
        />
      )}
      <AgentApprovedActionsSection agentId={agentId} catalog={catalog} />
    </>
  );
}
