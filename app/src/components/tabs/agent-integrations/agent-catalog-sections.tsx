import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { AgentApprovedActionsSection } from "./agent-approved-actions-section";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import { AgentUngrantedAppsSection } from "./agent-ungranted-apps-section";
import type { AgentIntegrationsView } from "./model";

interface AgentCatalogSectionsProps {
  view: AgentIntegrationsView;
  agentId: string;
  canEdit: boolean;
  /** The toolkit catalog, so the approved-actions review can resolve app identity. */
  catalog: IntegrationToolkit[];
}

/**
 * The agent-only sections that hang below the shared browse catalog (rendered
 * as the {@link CatalogPane}'s children): first the connected-but-off apps with
 * an inline turn-on toggle, then the read-only admin-blocked apps, then the
 * "Runs without asking" review of always-allowed actions. Each renders only
 * when it has rows — the approved-actions section self-gates on its own query,
 * so it shows in both grants and degraded modes whenever the agent has blessed
 * an action. Extracted from the body to keep it under the file-size ceiling.
 */
export function AgentCatalogSections({
  view,
  agentId,
  canEdit,
  catalog,
}: AgentCatalogSectionsProps) {
  const available = view.mode === "grants" ? view.availableRows : [];
  const disallowed = view.mode === "grants" ? view.disallowedRows : [];
  return (
    <>
      {available.length > 0 && (
        <AgentUngrantedAppsSection
          rows={available}
          agentId={agentId}
          canEdit={canEdit}
        />
      )}
      {disallowed.length > 0 && (
        <AgentDisallowedAppsSection rows={disallowed} />
      )}
      <AgentApprovedActionsSection agentId={agentId} catalog={catalog} />
    </>
  );
}
