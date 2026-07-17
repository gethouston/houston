import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import { AgentUngrantedAppsSection } from "./agent-ungranted-apps-section";
import type { AgentIntegrationsView } from "./model";

interface AgentCatalogSectionsProps {
  view: AgentIntegrationsView;
  agentId: string;
  canEdit: boolean;
}

/**
 * The agent-only sections that hang below the shared browse catalog (rendered
 * as the {@link CatalogPane}'s children): first the connected-but-off apps with
 * an inline turn-on toggle, then the read-only admin-blocked apps. Each renders
 * only when it has rows; in degraded mode neither exists so nothing shows.
 * Extracted from the body to keep it under the file-size ceiling.
 */
export function AgentCatalogSections({
  view,
  agentId,
  canEdit,
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
    </>
  );
}
