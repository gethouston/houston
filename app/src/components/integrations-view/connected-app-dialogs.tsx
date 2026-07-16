import { useAgentGrantToggle } from "../../hooks/queries/use-agent-grant-toggle";
import {
  AppDetailDialog,
  type ConnectedApps,
  type ConnectFlow,
  DisconnectAppDialog,
  type useConnectionSelection,
} from "../integrations";

interface ConnectedAppDialogsProps {
  apps: ConnectedApps;
  selection: ReturnType<typeof useConnectionSelection>;
  connectFlow: ConnectFlow;
  onRemove: (toolkit: string) => void;
}

/**
 * The connected-app dialogs for the global Integrations page: the per-app detail
 * MODAL — the ONE by-app grants surface, a per-agent Switch per agent via
 * {@link useAgentGrantToggle} (each row editable per `editableAgentIds`),
 * alongside reconnect + disconnect — and the confirm-gated disconnect dialog.
 * Extracted from the page so `integrations-ready.tsx` stays within the file-size
 * limit; the page owns the selection + connect flow and hands them in so a tile
 * click, a reconnect, and a disconnect all drive the same state.
 */
export function ConnectedAppDialogs({
  apps,
  selection,
  connectFlow,
  onRemove,
}: ConnectedAppDialogsProps) {
  const toggle = useAgentGrantToggle();
  const {
    selectedConn,
    selectedApp,
    disconnectApp,
    closeConn,
    requestDisconnect,
    closeDisconnect,
  } = selection;

  return (
    <>
      {selectedConn && selectedApp && (
        <AppDetailDialog
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
          onRemove(toolkit);
          closeDisconnect();
        }}
      />
    </>
  );
}
