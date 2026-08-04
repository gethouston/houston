import { CatalogShell } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
  useDisconnectIntegration,
} from "../../hooks/queries";
import {
  catalogHiddenToolkits,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import { CatalogControls } from "./catalog-controls";
import { CatalogBrowsePane, CatalogModeTabs } from "./catalog-mode-tabs";
import { InstalledSkeleton } from "./catalog-skeletons";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledStrip } from "./installed-strip";
import { useCatalogSurface } from "./use-catalog-surface";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page (personal mode): a hero
 * title + muted subtitle over the page-level source toggle
 * ({@link CatalogModeTabs} — one source at a time, HOU-980 review):
 *
 *  - **Integrations** (Composio): ONE controls row ({@link CatalogControls})
 *    whose search + category narrow the Installed strip (active catalog
 *    connections only) AND the browse catalog together, via the shared
 *    {@link CatalogShell}.
 *  - **Custom integrations**: the API / MCP surface with its OWN installed
 *    list up top ({@link CustomIntegrationsSection}).
 *
 * When the host doesn't serve custom integrations the toggle chrome drops and
 * the Composio surface renders bare. A catalog row opens the detail MODAL
 * (`AppDetailDialog` — never a slideover): view + reconnect + disconnect for
 * that personal connection. Which agents may use an app is managed in one
 * place (the Permissions view), never here. The connect flow is bound here
 * (connect-only) and handed to the catalog and the detail modal; its state is
 * app-wide and shared, so closing any of them, switching modes, or leaving
 * the page entirely never kills an in-flight OAuth poll, and a connect
 * started from chat shows up on these rows.
 *
 * The catalog shows the FULL Houston catalog. Policy is per agent only (the
 * org-wide app ceiling was removed), so the global page has no ceiling to
 * apply and never locks a row — locked browse rows live only on the per-agent
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
  // Same transport (and query key) as the CustomIntegrationsSection inside the
  // tab, so the chip and the tab body can never disagree — and the tab shows
  // behind the hosted gateway, which proxies only the per-agent custom routes.
  const customTransportAgentId = useCustomTransportAgentId();
  const custom = useCustomIntegrationsFor(customTransportAgentId);
  const selection = useConnectionSelection(apps);

  const surface = useCatalogSurface({
    active: apps.activeRows,
    catalog: apps.catalogData,
    connections: apps.connData,
    surface: "integrations",
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

  // The Integrations mode chip stays the UNFILTERED connectable total (what
  // the mode browses): every app minus the ones that left for the Installed
  // strip. An app whose connection never landed is still browsable here, so it
  // counts.
  const connectableCount = useMemo(() => {
    const hidden = catalogHiddenToolkits(apps.connData);
    return apps.catalogData.filter((tk) => !hidden.has(tk.slug)).length;
  }, [apps.catalogData, apps.connData]);

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

      <CatalogModeTabs
        mode={tab}
        onModeChange={setTab}
        catalogCount={apps.isLoading ? undefined : connectableCount}
        customData={custom.data}
        customListFailed={custom.isError}
      >
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
              // Omitted entirely (no heading) when the shared filter leaves
              // nothing installed, so the section only ever renders with rows.
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
      </CatalogModeTabs>

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
