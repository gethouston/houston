import { CatalogShell } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useDisconnectIntegration,
} from "../../hooks/queries";
import {
  CustomIntegrationDialogs,
  catalogHiddenToolkits,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
  useCustomSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import { CatalogControls } from "./catalog-controls";
import { InstalledSkeleton } from "./catalog-skeletons";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledStrip } from "./installed-strip";
import { useCatalogSurface } from "./use-catalog-surface";
import { useCatalogTabs } from "./use-catalog-tabs";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page (personal mode): a hero
 * title + muted subtitle over the {@link CatalogShell} layout —
 *
 *  1. the consolidated **Installed** section (active catalog connections AND
 *     custom integrations, as flat catalog rows — it belongs to both sources,
 *     so it sits OUTSIDE the tabs and never changes when the user switches),
 *     then
 *  2. two discovery tabs under an **Available** header: **Integrations** (the
 *     app catalog: {@link CatalogPane}, where an app whose connection never
 *     landed keeps its normal row, wearing its status) and **Custom
 *     integrations** (the API / MCP surface with its own internal search + Add
 *     controls row). When the host doesn't serve custom integrations the shell
 *     renders the catalog alone, no tab chrome.
 *
 * ONE controls row ({@link CatalogControls}) sits above BOTH sections: its
 * search + category filter narrow the Installed strip AND the Integrations tab
 * together (the Custom tab keeps its own internal search). A custom row in the
 * section jumps to the Custom tab (its row holds
 * the status / key / remove affordances); a catalog row opens the detail
 * MODAL (`AppDetailDialog`, the same `CatalogDetailDialog` the browse rows use
 * — never a slideover): view + reconnect + disconnect for that personal
 * connection. Which agents may use an app is managed in one place (the
 * Permissions view), never here. The connect flow is bound here (connect-only)
 * and handed to the catalog and the detail modal; its state
 * is app-wide and shared, so closing any of them, switching tabs, or leaving
 * the page entirely never kills an in-flight OAuth poll, and a connect started
 * from chat shows up on these rows.
 *
 * The catalog shows the FULL Houston catalog. Policy is per agent only (the
 * org-wide app ceiling was removed), so the global page has no ceiling to apply
 * and never locks a row — locked browse rows live only on the per-agent
 * Integrations tab, keyed to that agent's ceiling.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({});
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const custom = useCustomIntegrations();
  const selection = useConnectionSelection(apps);
  const customSelection = useCustomSelection();

  // `null` = the host doesn't serve custom integrations: no Custom tab (the
  // shell drops the tab chrome), no custom tiles in the strip.
  const customItems = custom.data ?? [];
  const surface = useCatalogSurface({
    active: apps.activeRows,
    custom: customItems,
    catalog: apps.catalogData,
    connections: apps.connData,
  });
  const {
    tab,
    setTab,
    query,
    setQuery,
    category,
    setCategory,
    filtering,
    shown,
    installedCount,
    availableCount,
  } = surface;

  // The catalog tab's count chip stays the UNFILTERED connectable total (what
  // the tab browses): every app minus the ones that left for the Installed
  // strip. An app whose connection never landed is still browsable here, so it
  // counts.
  const connectableCount = useMemo(() => {
    const hidden = catalogHiddenToolkits(apps.connData);
    return apps.catalogData.filter((tk) => !hidden.has(tk.slug)).length;
  }, [apps.catalogData, apps.connData]);
  const tabs = useCatalogTabs({
    catalog: apps.catalogData,
    connections: apps.connData,
    surface: "integrations",
    query,
    setQuery,
    category,
    isLoading: apps.isLoading,
    connectFlow,
    onRemove: (toolkit) => disconnect.mutate({ toolkit }),
    catalogCount: apps.isLoading ? undefined : connectableCount,
    customData: custom.data,
  });

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={
          apps.catalogData.length > 0
            ? t("home.descriptionCount", { count: apps.catalogData.length })
            : t("home.description")
        }
        className="mb-7"
      />

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      <CatalogShell
        controls={
          <CatalogControls
            catalog={apps.catalogData}
            connections={apps.connData}
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
          />
        }
        installedTitle={t("home.installedTitle")}
        installedCount={apps.isLoading ? undefined : installedCount}
        installed={
          apps.isLoading ? (
            <InstalledSkeleton />
          ) : installedCount > 0 ? (
            // Omitted entirely (no heading) when the shared filter leaves nothing
            // installed, so the section only ever renders with rows.
            <InstalledStrip
              active={shown.active}
              custom={shown.custom}
              onOpen={selection.openConn}
              onOpenCustom={(integration) =>
                customSelection.openDetail(integration.slug)
              }
              searching={filtering}
            />
          ) : undefined
        }
        availableTitle={t("home.availableTitle")}
        // With >1 tab the tab chips carry the counts, so the header chip would
        // duplicate the "Integrations [n]" tab chip sitting right below it.
        availableCount={
          apps.isLoading || tabs.length > 1 ? undefined : availableCount
        }
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />

      <ConnectedAppDialogs
        selection={selection}
        connectFlow={connectFlow}
        onRemove={(toolkit, connectionId) =>
          disconnect.mutate({ toolkit, connectionId })
        }
      />

      {/* An Installed-strip custom tile opens its detail card right here (the
          section inside the Custom tab has its own instance for row clicks). */}
      <CustomIntegrationDialogs selection={customSelection} />
    </>
  );
}
