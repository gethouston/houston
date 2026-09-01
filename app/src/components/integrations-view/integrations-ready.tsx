import { CatalogShell } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AddCustomButton,
  type ConnectedApps,
  type CustomIntegrationsSurface,
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
  // The curated connect dialog's subject (a slug from the browse catalog).
  const [curatedSlug, setCuratedSlug] = useState<string | null>(null);
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

      {/* Above the shell: the in-flow draft banner must greet the user, not
          trail a long catalog (the chat panel and dialogs are portals and
          render wherever they like). */}
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
                <AddCustomButton surface={custom} compact={inStrip} />
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
              onCustomSignIn={(slug) => custom.signIn.mutate(slug)}
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
                      onRemove={(toolkit) => disconnect.mutate({ toolkit })}
                      onCuratedConnect={setCuratedSlug}
                    />
                  ),
                },
              ]
        }
      />

      {/* Only a RESOLVED list may claim emptiness — while it loads or after a
          failed read (CustomSurfaceSupport's loud error above), saying "none
          yet" would contradict the truth. */}
      {category === "custom" &&
        Array.isArray(custom.items) &&
        shown.custom.length === 0 &&
        !apps.isLoading && (
          <p className="text-sm text-ink-muted">
            {t(custom.items.length > 0 ? "custom.noResults" : "custom.empty")}
          </p>
        )}

      <ConnectedAppDialogs
        selection={selection}
        connectFlow={connectFlow}
        onRemove={(toolkit, connectionId) =>
          disconnect.mutate({ toolkit, connectionId })
        }
      />

      <CuratedConnectDialog
        curated={
          curatedSlug === null
            ? null
            : (curatedIntegrationOf(curatedSlug) ?? null)
        }
        agentId={custom.transportAgentId}
        onClose={() => setCuratedSlug(null)}
      />
    </>
  );
}
