import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AppDetailSheet,
  appDisplay,
  ConnectMoreAppsSection,
  categoryListView,
  INTEGRATION_PROVIDER,
  IntegrationDisconnectDialog,
  ReconnectBanner,
  toolkitsInCategory,
  useConnectFlow,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import {
  ConnectedAppsList,
  ConnectedAppsListSkeleton,
} from "./connected-apps-list";
import { agentChipsFor } from "./integrations-view-model";
import { useAgentGrantToggle } from "./use-agent-grant-toggle";
import { useConnectedApps } from "./use-connected-apps";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page. Two always-present sections:
 * the apps the user has connected (a two-column grid of cards, each opening the
 * detail sheet for per-agent access, with pending / errored connections shown
 * full-width for recovery), then the full "Connect more apps" catalog so a
 * brand-new user immediately sees the 1000+ connectable apps. ONE connect flow
 * lives here (connect-only, no auto-grant) and is handed to the catalog, the
 * recovery callouts, and the detail sheet so closing any of them never kills an
 * in-flight OAuth poll.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({ autoGrant: false });
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const toggle = useAgentGrantToggle();

  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [disconnectToolkit, setDisconnectToolkit] = useState<string | null>(
    null,
  );
  // View-only category filter (composes with the catalog's own search). One
  // selection filters BOTH the connected grid and the "Connect more" catalog.
  const [category, setCategory] = useState("all");

  // The detail sheet reflects the LIVE connection, re-resolved by the exact
  // connection id the user opened (a toolkit can have more than one account,
  // e.g. an active login next to a leftover pending one — keying by toolkit
  // would resolve the wrong row). A disconnect elsewhere drops it and closes.
  const connKey = (c: { connectionId: string; toolkit: string }) =>
    c.connectionId || c.toolkit;
  const selectedConn = selectedConnId
    ? apps.connData.find((c) => connKey(c) === selectedConnId)
    : undefined;
  const selectedApp = selectedConn
    ? appDisplay(selectedConn.toolkit, apps.bySlug.get(selectedConn.toolkit))
    : null;
  const disconnectApp = disconnectToolkit
    ? appDisplay(disconnectToolkit, apps.bySlug.get(disconnectToolkit))
    : null;

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
                onManage={(c) => setSelectedConnId(connKey(c))}
                onRemove={(toolkit) => disconnect.mutate(toolkit)}
              />
            )}
          </section>
        )}

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
            if (!open) setSelectedConnId(null);
          }}
          display={selectedApp}
          connection={selectedConn}
          agents={apps.agentChips}
          activeAgentIds={
            new Set(apps.grantMap.get(selectedConn.toolkit) ?? [])
          }
          grantsSupported={apps.grantsSupported}
          canEdit={apps.canEdit}
          onToggleAgent={(agentId, active) =>
            toggle.mutate({ agentId, toolkit: selectedConn.toolkit, active })
          }
          onReconnect={() => {
            void connectFlow.connect(selectedConn.toolkit);
            setSelectedConnId(null);
          }}
          onDisconnect={() => {
            setDisconnectToolkit(selectedConn.toolkit);
            setSelectedConnId(null);
          }}
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectApp}
        scope="everywhere"
        affectedAgents={
          disconnectApp
            ? agentChipsFor(
                apps.grantMap.get(disconnectApp.toolkit) ?? [],
                apps.chipById,
              )
            : undefined
        }
        onClose={() => setDisconnectToolkit(null)}
        onConfirm={(toolkit) => {
          disconnect.mutate(toolkit);
          setDisconnectToolkit(null);
        }}
      />
    </>
  );
}
