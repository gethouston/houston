import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRenameIntegrationConnection } from "../../hooks/queries/use-integrations";
import {
  AppDetailSheet,
  accountDisplayLabel,
  appDisplay,
  ConnectMoreAppsSection,
  type CustomDialogTarget,
  CustomIntegrationDialog,
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
 * the apps the user has connected (a two-column grid of cards, ONE per app, each
 * opening the detail sheet for per-ACCOUNT access, rename, disconnect, and
 * adding another account, with pending / errored connections shown full-width
 * per account for recovery), then the full "Connect more apps" catalog. ONE
 * connect flow lives here (connect-only, no auto-grant) and is handed to the
 * catalog, the recovery callouts, and the detail sheet so closing any of them
 * never kills an in-flight OAuth poll.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({ autoGrant: false });
  const rename = useRenameIntegrationConnection(INTEGRATION_PROVIDER);
  const toggle = useAgentGrantToggle();

  // The sheet is keyed by TOOLKIT so it shows every account of the app; the
  // disconnect dialog is keyed by the single ACCOUNT the user is removing. Both
  // resolve against the live connection list, so a disconnect elsewhere drops
  // the row and (when it was the last account) closes the sheet on its own.
  const [selectedToolkit, setSelectedToolkit] = useState<string | null>(null);
  const [disconnectConnId, setDisconnectConnId] = useState<string | null>(null);
  // The custom-integration edit dialog (opened from the detail sheet's "Edit").
  const [customEdit, setCustomEdit] = useState<CustomDialogTarget | null>(null);
  const selectedIsCustom =
    selectedToolkit !== null && apps.customSlugs.has(selectedToolkit);

  const selectedConnections = selectedToolkit
    ? apps.connData.filter((c) => c.toolkit === selectedToolkit)
    : [];
  const selectedApp =
    selectedToolkit && selectedConnections.length > 0
      ? appDisplay(selectedToolkit, apps.bySlug.get(selectedToolkit))
      : null;

  const disconnectConn = disconnectConnId
    ? apps.connData.find((c) => c.connectionId === disconnectConnId)
    : undefined;
  const disconnectApp = disconnectConn
    ? appDisplay(
        disconnectConn.toolkit,
        apps.bySlug.get(disconnectConn.toolkit),
      )
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
                active={apps.activeCards}
                recovering={apps.recoveringRows}
                grantsSupported={apps.grantsSupported}
                connectFlow={connectFlow}
                onManage={setSelectedToolkit}
                onRemove={apps.disconnect}
                customToolkits={apps.customSlugs}
              />
            )}
          </section>
        )}

        <ConnectMoreAppsSection
          catalog={apps.catalogData}
          connections={apps.connData}
          connectFlow={connectFlow}
          loading={apps.catalogLoading}
          customEnabled={apps.customEnabled}
        />
      </div>

      {selectedApp && (
        <AppDetailSheet
          open
          onOpenChange={(open) => {
            if (!open) setSelectedToolkit(null);
          }}
          display={selectedApp}
          connections={selectedConnections}
          agents={apps.agentChips}
          activeAgentIdsByConnection={apps.activeAgentIdsByConnection}
          grantsSupported={apps.grantsSupported}
          canEdit={apps.canEdit}
          connectInFlight={connectFlow.state !== null}
          onToggleAgent={(connectionId, agentId, active) =>
            toggle.mutate({ agentId, connectionId, active })
          }
          onRename={(connectionId, alias) =>
            rename.mutate({ connectionId, alias })
          }
          onReconnect={(connectionId) => {
            const conn = selectedConnections.find(
              (c) => c.connectionId === connectionId,
            );
            if (conn) void connectFlow.connect(conn.toolkit);
            setSelectedToolkit(null);
          }}
          onDisconnect={setDisconnectConnId}
          onAddAccount={(toolkit) => void connectFlow.connect(toolkit)}
          custom={selectedIsCustom}
          onEdit={() => {
            setCustomEdit({
              mode: "edit",
              connectionId: selectedApp.toolkit,
              name: selectedApp.name,
              description: selectedApp.description,
            });
            setSelectedToolkit(null);
          }}
        />
      )}

      <CustomIntegrationDialog
        target={customEdit}
        onClose={() => setCustomEdit(null)}
        autoGrant={false}
      />

      <IntegrationDisconnectDialog
        app={disconnectApp}
        connectionId={disconnectConnId}
        accountLabel={
          disconnectConn
            ? accountDisplayLabel(disconnectConn, t("account.unnamed"))
            : undefined
        }
        scope="everywhere"
        affectedAgents={
          disconnectConnId
            ? agentChipsFor(
                apps.accountAgents.get(disconnectConnId) ?? [],
                apps.chipById,
              )
            : undefined
        }
        onClose={() => setDisconnectConnId(null)}
        onConfirm={(connectionId) => {
          apps.disconnect(connectionId);
          setDisconnectConnId(null);
        }}
      />
    </>
  );
}
