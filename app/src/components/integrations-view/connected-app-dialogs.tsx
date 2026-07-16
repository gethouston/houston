import {
  AppDetailDialog,
  type ConnectFlow,
  IntegrationDisconnectDialog,
  type useConnectionSelection,
} from "../integrations";

interface ConnectedAppDialogsProps {
  selection: ReturnType<typeof useConnectionSelection>;
  connectFlow: ConnectFlow;
  onRemove: (toolkit: string) => void;
}

/**
 * The connected-app dialogs for the global Integrations page: the per-app detail
 * MODAL (info + reconnect + disconnect — a personal connection surface, never a
 * permission editor) and the confirm-gated "disconnect everywhere" dialog.
 * Extracted from the page so `integrations-ready.tsx` stays within the file-size
 * limit; the page owns the selection + connect flow and hands them in so a tile
 * click, a reconnect, and a disconnect all drive the same state.
 */
export function ConnectedAppDialogs({
  selection,
  connectFlow,
  onRemove,
}: ConnectedAppDialogsProps) {
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
          onReconnect={() => {
            void connectFlow.connect(selectedConn.toolkit);
            closeConn();
          }}
          onDisconnect={() => requestDisconnect(selectedConn.toolkit)}
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectApp}
        onClose={closeDisconnect}
        onConfirm={(toolkit) => {
          onRemove(toolkit);
          closeDisconnect();
        }}
      />
    </>
  );
}
