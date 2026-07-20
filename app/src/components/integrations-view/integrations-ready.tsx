import { CatalogShell, type CatalogShellTab } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useDisconnectIntegration,
} from "../../hooks/queries";
import {
  CustomIntegrationsSection,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import { CatalogControls } from "./catalog-controls";
import { CatalogPane } from "./catalog-pane";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledSkeleton, InstalledStrip } from "./installed-strip";
import { useCatalogSurface } from "./use-catalog-surface";

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
 *     app catalog: {@link CatalogPane} with recovery rows) and **Custom
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
 * Permissions view), never here. ONE connect flow lives here (connect-only) and
 * is handed to the catalog, the recovery rows, and the detail modal so closing
 * any of them, or switching tabs, never kills an in-flight OAuth poll.
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
  // the tab browses); the Available header's count follows the shared filter.
  const connectableCount = useMemo(() => {
    const connected = new Set(apps.connData.map((c) => c.toolkit));
    return apps.catalogData.filter((tk) => !connected.has(tk.slug)).length;
  }, [apps.catalogData, apps.connData]);
  const tabs: CatalogShellTab[] = [
    {
      value: "catalog",
      label: t("home.tabs.catalog"),
      count: apps.isLoading ? undefined : connectableCount,
      content: (
        <CatalogPane
          catalog={apps.catalogData}
          connections={apps.connData}
          query={query}
          category={category}
          recovering={apps.recoveringRows}
          isLoading={apps.isLoading}
          connectFlow={connectFlow}
          onRemoveRecovering={(toolkit) => disconnect.mutate(toolkit)}
        />
      ),
    },
    ...(custom.data !== null
      ? [
          {
            value: "custom",
            label: t("home.tabs.custom"),
            count: custom.data?.length,
            content: <CustomIntegrationsSection variant="tab" />,
          },
        ]
      : []),
  ];

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
              onOpenCustom={() => setTab("custom")}
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
        onRemove={(toolkit) => disconnect.mutate(toolkit)}
      />
    </>
  );
}
