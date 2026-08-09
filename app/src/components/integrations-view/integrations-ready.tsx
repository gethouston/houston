import { CatalogShell } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  type ConnectedApps,
  CustomIntegrationsSection,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { CatalogBrowsePane } from "./catalog-browse-pane";
import { CatalogControls } from "./catalog-controls";
import { InstalledSkeleton } from "./catalog-skeletons";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledStrip } from "./installed-strip";
import type { IntegrationsMode } from "./integrations-header";
import type { CatalogSurface } from "./use-catalog-surface";

export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
  mode,
  apps,
  surface,
}: {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
  mode: IntegrationsMode;
  apps: ConnectedApps;
  surface: CatalogSurface;
}) {
  const { t } = useTranslation("integrations");
  const connectFlow = useConnectFlow({});
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const selection = useConnectionSelection(apps);
  const {
    query,
    setQuery,
    category,
    setCategory,
    filtering,
    shown,
    installedCount,
    availableCount,
  } = surface;

  return (
    <>
      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      {mode === "custom" ? (
        <CustomIntegrationsSection variant="tab" />
      ) : (
        <>
          <PageHeaderTools>
            {(inStrip) => (
              <CatalogControls
                catalog={apps.catalogData}
                connections={apps.connData}
                query={query}
                onQueryChange={setQuery}
                category={category}
                onCategoryChange={setCategory}
                variant={inStrip ? "strip" : "row"}
              />
            )}
          </PageHeaderTools>
          <CatalogShell
            installedTitle={t("home.installedTitle")}
            installed={
              apps.isLoading ? (
                <InstalledSkeleton />
              ) : installedCount > 0 ? (
                <InstalledStrip
                  active={shown.active}
                  onOpen={selection.openConn}
                  searching={filtering}
                />
              ) : undefined
            }
            availableTitle={t("home.availableTitle")}
            availableCount={apps.isLoading ? undefined : availableCount}
            tabs={[
              {
                value: "catalog",
                label: t("home.tabs.catalog"),
                content: (
                  <CatalogBrowsePane
                    catalog={apps.catalogData}
                    connections={apps.connData}
                    surface="integrations"
                    query={query}
                    setQuery={setQuery}
                    category={category}
                    isLoading={apps.isLoading}
                    connectFlow={connectFlow}
                    onRemove={(toolkit) => disconnect.mutate({ toolkit })}
                  />
                ),
              },
            ]}
          />
        </>
      )}

      <ConnectedAppDialogs
        selection={selection}
        connectFlow={connectFlow}
        onRemove={(toolkit, connectionId) =>
          disconnect.mutate({ toolkit, connectionId })
        }
      />
    </>
  );
}
