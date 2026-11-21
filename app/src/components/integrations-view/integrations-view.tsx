import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { CatalogTab } from "./catalog-tab";
import {
  INTEGRATIONS_HEADER_THRESHOLDS,
  IntegrationsHeader,
} from "./integrations-header";

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
