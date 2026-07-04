import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AppCatalogPicker,
  AppDetailSheet,
  appDisplay,
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
 * The ready state of the global Integrations page: every connected app, the
 * agents using it, per-agent activation and disconnects, and adding new apps.
 * ONE connect flow lives here (connect-only, no auto-grant) and is handed to the
 * picker, the recovery callouts and the detail sheet so closing any of them
 * never kills an in-flight OAuth poll.
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

  const [pickerOpen, setPickerOpen] = useState(false);
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-normal text-foreground">
            {t("home.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("home.description")}
          </p>
        </div>
        <Button
          className="shrink-0 rounded-full"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-4" />
          {t("home.addApp")}
        </Button>
      </div>

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      {apps.isLoading ? (
        <ConnectedAppsListSkeleton />
      ) : hasConnections ? (
        <ConnectedAppsList
          active={apps.activeRows}
          recovering={apps.recoveringRows}
          grantsSupported={apps.grantsSupported}
          connectFlow={connectFlow}
          onManage={(c) => setSelectedConnId(connKey(c))}
          onRemove={(toolkit) => disconnect.mutate(toolkit)}
        />
      ) : (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("home.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("home.empty.body")}</EmptyDescription>
          </EmptyHeader>
          <Button
            className="mt-4 rounded-full"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-4" />
            {t("home.empty.cta")}
          </Button>
        </Empty>
      )}

      <AppCatalogPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        catalog={apps.catalogData}
        connections={apps.connData}
        connectFlow={connectFlow}
        loading={apps.catalogLoading}
      />

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
