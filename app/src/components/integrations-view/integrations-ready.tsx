import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AppDetailSheet,
  appDisplay,
  ConnectMoreAppsSection,
  INTEGRATION_PROVIDER,
  IntegrationDisconnectDialog,
  ReconnectBanner,
  useConnectFlow,
} from "../integrations";
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

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[28px] font-normal text-foreground">
          {t("home.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("home.description")}
        </p>
      </div>

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
            ) : (
              <ConnectedAppsList
                active={apps.activeRows}
                recovering={apps.recoveringRows}
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
