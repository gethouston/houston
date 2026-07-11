import { Spinner } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../../hooks/queries";
import { useAgentGrantToggle } from "../../../hooks/queries/use-agent-grant-toggle";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useUIStore } from "../../../stores/ui";
import {
  AppDetailSheet,
  ConnectedAppsList,
  DisconnectAppDialog,
  ReconnectBanner,
  useActiveIntegration,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../../integrations";
import { INTEGRATIONS_VIEW_ID } from "../../integrations-view/id";
import { connectAffordance } from "../connected-accounts-model";

interface ConnectedAccountsBodyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready-state body of Settings > Connected accounts: the derived connection
 * read-model, the one-column list, and the per-app detail sheet + disconnect
 * dialog. ONE connect flow (connect-only, no auto-grant) is shared by the
 * recovery callouts and the sheet's reconnect so closing either never kills an
 * in-flight OAuth poll. Connecting MORE apps is a link to the global catalog
 * page, or a muted hint on a Teams host where that page carries no catalog.
 */
export function ConnectedAccountsBody({
  reconnectNotice,
  dismissReconnect,
}: ConnectedAccountsBodyProps) {
  const { t } = useTranslation("settings");
  const { capabilities } = useCapabilities();
  const { providerId } = useActiveIntegration();
  const apps = useConnectedApps(providerId);
  const connectFlow = useConnectFlow({
    autoGrant: false,
    provider: providerId,
  });
  const disconnect = useDisconnectIntegration(providerId);
  const toggle = useAgentGrantToggle();
  const setViewMode = useUIStore((s) => s.setViewMode);
  const {
    selectedConn,
    selectedApp,
    disconnectApp,
    openConn,
    closeConn,
    requestDisconnect,
    closeDisconnect,
  } = useConnectionSelection(apps);

  const hasConnections = apps.connData.length > 0;
  const affordance = connectAffordance(capabilities);

  return (
    <div className="space-y-4">
      {reconnectNotice && <ReconnectBanner onDismiss={dismissReconnect} />}

      <h3 className="text-sm font-medium text-foreground">
        {t("connectedAccounts.heading")}
      </h3>

      {apps.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : hasConnections ? (
        <ConnectedAppsList
          active={apps.activeRows}
          recovering={apps.recoveringRows}
          grantsSupported={apps.grantsSupported}
          connectFlow={connectFlow}
          columns={1}
          onOpen={openConn}
          onRemove={(toolkit) => disconnect.mutate(toolkit)}
        />
      ) : (
        <p className="rounded-xl bg-secondary px-6 py-10 text-center text-sm text-muted-foreground">
          {t("connectedAccounts.empty")}
        </p>
      )}

      {affordance === "link" ? (
        <button
          type="button"
          onClick={() => setViewMode(INTEGRATIONS_VIEW_ID)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          <Plus className="size-4" />
          {t("connectedAccounts.connectMore")}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("connectedAccounts.connectHint")}
        </p>
      )}

      {selectedConn && selectedApp && (
        <AppDetailSheet
          open
          onOpenChange={(open) => {
            if (!open) closeConn();
          }}
          display={selectedApp}
          connection={selectedConn}
          agents={apps.agentChips}
          activeAgentIds={
            new Set(apps.grantMap.get(selectedConn.toolkit) ?? [])
          }
          grantsSupported={apps.grantsSupported}
          editableAgentIds={apps.editableAgentIds}
          onToggleAgent={(agentId, active) =>
            toggle.mutate({ agentId, toolkit: selectedConn.toolkit, active })
          }
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
    </div>
  );
}
