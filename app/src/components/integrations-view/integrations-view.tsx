import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { CatalogTab } from "./catalog-tab";
import {
  INTEGRATIONS_HEADER_THRESHOLDS,
  IntegrationsHeader,
} from "./integrations-header";

/**
 * The global personal Integrations surface: what this person's agents can
 * reach outside themselves, as the apps CATALOG under one identity lozenge.
 * What those agents can DO is the Skills library, its own screen from its own
 * rail row.
 *
 * The tools provider spans the header and the body, so the catalog portals its
 * own search and actions into the strip.
 */
export function IntegrationsView() {
  return (
    <PageHeaderToolsProvider thresholds={INTEGRATIONS_HEADER_THRESHOLDS}>
      <div className="flex h-full min-h-0 flex-col">
        <IntegrationsHeader />
        <CatalogTab />
      </div>
    </PageHeaderToolsProvider>
  );
}
