import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AppDetailSheet,
  ConnectedAppsList,
  ConnectedAppsListSkeleton,
  ConnectMoreAppsSection,
  CustomIntegrationsSection,
  categoryListView,
  DisconnectAppDialog,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  toolkitsInCategory,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page (personal mode). Two
 * always-present sections: the apps the user has connected (a two-column grid of
 * cards, each opening the detail sheet, with pending / errored connections shown
 * full-width for recovery), then the full "Connect more apps" catalog so a
 * brand-new user immediately sees the 1000+ connectable apps. Per-agent access
 * now lives in Settings > Connected accounts, so the detail sheet here is
 * view + reconnect + disconnect only. ONE connect flow lives here (connect-only,
 * no auto-grant) and is handed to the catalog, the recovery callouts, and the
 * detail sheet so closing any of them never kills an in-flight OAuth poll.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({ autoGrant: false });
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const {
    selectedConn,
    selectedApp,
    disconnectApp,
    openConn,
    closeConn,
    requestDisconnect,
    closeDisconnect,
  } = useConnectionSelection(apps);

  // View-only category filter (composes with the catalog's own search). One
  // selection filters BOTH the connected grid and the "Connect more" catalog.
  const [category, setCategory] = useState("all");

  const hasConnections = apps.connData.length > 0;

  // Narrow the connected rows to the picked category the same way the catalog
  // narrows below, so one control filters the whole page.
  const inCat = useMemo(
    () => toolkitsInCategory(apps.catalogData, category),
    [apps.catalogData, category],
  );
  const activeInCat = inCat
    ? apps.activeRows.filter((r) => inCat.has(r.connection.toolkit))
    : apps.activeRows;
  const recoveringInCat = inCat
    ? apps.recoveringRows.filter((r) => inCat.has(r.connection.toolkit))
    : apps.recoveringRows;
  const connectedView = categoryListView({
    visibleCount: activeInCat.length + recoveringInCat.length,
    hasAny: hasConnections,
    categoryFiltered: category !== "all",
  });

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.description")}
        className="mb-6"
      />

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      <div className="space-y-8">
        {(apps.isLoading || hasConnections) && (
          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("home.connectedTitle")}
            </h3>
            {apps.isLoading ? (
              <ConnectedAppsListSkeleton />
            ) : connectedView === "empty-category" ? (
              <p className="rounded-xl bg-secondary px-6 py-10 text-center text-sm text-muted-foreground">
                {t("home.connectedNoneInCategory")}
              </p>
            ) : (
              <ConnectedAppsList
                active={activeInCat}
                recovering={recoveringInCat}
                grantsSupported={apps.grantsSupported}
                connectFlow={connectFlow}
                columns={2}
                onOpen={openConn}
                onRemove={(toolkit) => disconnect.mutate(toolkit)}
              />
            )}
          </section>
        )}

        <CustomIntegrationsSection />

        <ConnectMoreAppsSection
          catalog={apps.catalogData}
          connections={apps.connData}
          connectFlow={connectFlow}
          category={category}
          onCategoryChange={setCategory}
          loading={apps.catalogLoading}
        />
      </div>

      {selectedConn && selectedApp && (
        <AppDetailSheet
          open
          onOpenChange={(open) => {
            if (!open) closeConn();
          }}
          display={selectedApp}
          connection={selectedConn}
          onReconnect={() => {
            void connectFlow.connect(selectedConn.toolkit);
            closeConn();
          }}
          onDisconnect={() => requestDisconnect(selectedConn.toolkit)}
        />
      )}

      <DisconnectAppDialog
        app={disconnectApp}
        grantMap={apps.grantMap}
        chipById={apps.chipById}
        onClose={closeDisconnect}
        onConfirm={(toolkit) => {
          disconnect.mutate(toolkit);
          closeDisconnect();
        }}
      />
    </>
  );
}
