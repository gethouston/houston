import { CatalogShell } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  claimSignInTab,
  useDisconnectIntegration,
  useIntegrationToolkits,
} from "../../hooks/queries";
import {
  AddCustomButton,
  type ConnectedApps,
  type CustomIntegrationsSurface,
  CustomScopeControl,
  CustomSurfaceSupport,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { CuratedConnectDialog } from "../integrations/curated-connect-dialog";
import { curatedIntegrationOf } from "../integrations/curated-integrations";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { CatalogBrowsePane } from "./catalog-browse-pane";
import { CatalogControls } from "./catalog-controls";
import { InstalledSkeleton } from "./catalog-skeletons";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledStrip } from "./installed-strip";
import type { CatalogSurface } from "./use-catalog-surface";

export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
  apps,
  surface,
  custom,
}: {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
  apps: ConnectedApps;
  surface: CatalogSurface;
  custom: CustomIntegrationsSurface;
}) {
  const { t } = useTranslation("integrations");
  const connectFlow = useConnectFlow({});
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const selection = useConnectionSelection(apps);
  const [curatedRequest, setCuratedRequest] = useState<{
    slug: string;
    providerConnect: () => void;
  } | null>(null);
  const curated =
    curatedRequest === null
      ? null
      : (curatedIntegrationOf(curatedRequest.slug) ?? null);
  const providerCatalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const providerHasCurated =
    curatedRequest !== null &&
    (providerCatalog.data ?? []).some((tk) => tk.slug === curatedRequest.slug);
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

      <CustomSurfaceSupport surface={custom} />

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
            customAvailable={Array.isArray(custom.items)}
            addCustom={
              Array.isArray(custom.items) ? (
                <>
                  <CustomScopeControl surface={custom} compact={inStrip} />
                  <AddCustomButton surface={custom} compact={inStrip} />
                </>
              ) : undefined
            }
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
              custom={shown.custom}
              onOpen={selection.openConn}
              customSelection={custom.selection}
              onCustomSignIn={(slug) =>
                curatedIntegrationOf(slug)
                  ? setCuratedRequest({
                      slug,
                      providerConnect: () =>
                        void connectFlow.connect(
                          slug,
                          `integrations:installed:${slug}`,
                        ),
                    })
                  : custom.signIn.mutate({ slug, tab: claimSignInTab() })
              }
              searching={filtering}
            />
          ) : undefined
        }
        availableTitle={
          category === "custom" ? undefined : t("home.availableTitle")
        }
        availableCount={
          category === "custom"
            ? undefined
            : apps.isLoading
              ? undefined
              : availableCount
        }
        tabs={
          category === "custom"
            ? []
            : [
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
                      onRemove={(toolkit) => disconnect({ toolkit })}
                      onCuratedConnect={(slug, providerConnect) =>
                        setCuratedRequest({ slug, providerConnect })
                      }
                    />
                  ),
                },
              ]
        }
      />

      {category === "custom" &&
        Array.isArray(custom.items) &&
        shown.custom.length === 0 &&
        !apps.isLoading && (
          <p className="text-sm text-ink-muted">
            {custom.items.length > 0
              ? t("custom.noResults")
              : custom.scopeAgent
                ? t("custom.emptyForAgent", { agent: custom.scopeAgent.name })
                : t("custom.empty")}
          </p>
        )}

      <ConnectedAppDialogs
        selection={selection}
        connectFlow={connectFlow}
        onRemove={(toolkit, connectionId) =>
          disconnect({ toolkit, connectionId })
        }
      />

      <CuratedConnectDialog
        curated={curated}
        agentId={custom.transportAgentId}
        providerConnect={
          providerHasCurated ? curatedRequest?.providerConnect : undefined
        }
        onClose={() => setCuratedRequest(null)}
      />
    </>
  );
}
